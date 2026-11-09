/**
 * Registro de afiliados desde Pro (/registro).
 *
 * Reemplaza el camino "formulario de la tienda → n8n" (flujo `registro-afilados`) sin contraseña de Shopify:
 *   1. Se valida el formulario y se manda un código de 6 dígitos al correo. NADA se crea todavía.
 *   2. Con el código bien puesto (el correo es de quien se registra) se crea la cuenta, en pasos que se
 *      pueden reanudar si algo se corta: cliente de Shopify con la etiqueta `especialista`, su metafield
 *      `referido`, su colección (plantilla `coleccion-afiliado`, metafield `especId`) y la fila en
 *      `affiliates`. Es lo mismo que hacía n8n, pero sin la espera de 10 segundos que a veces fallaba.
 *   3. Se devuelve el token de sesión, igual que el login por código, y la persona queda dentro de Pro.
 *
 * Lo que arregla de paso: `referral_id` (hoy casi siempre "N/A" porque n8n tomaba el campo equivocado) y
 * las altas a medias (cada paso queda anotado en `registro_afiliados`).
 *
 * Interruptor: REGISTRO_PRO_ACTIVO=1. Con cualquier otro valor las rutas responden "aún no está abierto".
 * Avisos de falla: REGISTRO_ALERTA_EMAIL (o, si no está, BASELINKER_ALERTA_EMAIL).
 */

import crypto from "crypto";
import { Resend } from "resend";
import { supabase } from "@/lib/customerSupplements";
import { signCustomerToken } from "@/lib/customerAppAuth";
import {
  normalizeEmail, isValidEmail, generateCode, hashCode, safeEqual,
  CODE_TTL_MIN, MAX_ATTEMPTS, RESEND_COOLDOWN_SEC, MAX_CODES_PER_EMAIL_HOUR, MAX_CODES_PER_IP_HOUR,
} from "@/lib/customerAppAccount";

const resend = new Resend(process.env.RESEND_API_KEY);
const API_SHOPIFY = "2025-01"; // la misma versión que usaba n8n

export const registroAbierto = () => process.env.REGISTRO_PRO_ACTIVO === "1";
export const claveRegistro = (email) => `reg:${normalizeEmail(email)}`;

// ── Formulario ───────────────────────────────────────────────────────────────

export const PROFESIONES = [
  "Médico", "Nutricionista", "Dietista", "Fisioterapeuta", "Quiropráctico", "Entrenador Personal",
  "Preparador Físico", "Instructor de Gimnasio", "Coach Deportivo", "Health Coach", "Wellness Coach",
  "Life Coach", "Influencer/Blogger de salud", "Dueño de Gimnasio", "Asesor de Suplementos", "Otro",
];

const limpiar = (v, max = 120) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

/** Los 10 dígitos del teléfono mexicano, aunque lo escriban con +52, 52, 521, espacios o guiones. */
export function telefonoMx(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("521")) d = d.slice(3);
  else if (d.length >= 12 && d.startsWith("52")) d = d.slice(2);
  return d.length === 10 ? d : "";
}

/** { datos } si todo está bien, { errores } si no, { bot: true } si cayó en el campo trampa. */
export function validarDatos(b = {}) {
  if (limpiar(b.sitio)) return { bot: true };

  const d = {
    nombre: limpiar(b.nombre, 60),
    apellido: limpiar(b.apellido, 80),
    email: normalizeEmail(b.email),
    telefono: telefonoMx(b.telefono),
    profesion: limpiar(b.profesion, 60),
    otraProfesion: limpiar(b.otraProfesion, 80),
    cedula: limpiar(b.cedula, 20).toUpperCase(),
    pacientes: Number.parseInt(b.pacientes, 10),
    redSocial: limpiar(b.redSocial, 120),
    estado: limpiar(b.estado, 60),
    ciudad: limpiar(b.ciudad, 80),
    direccion: limpiar(b.direccion, 160),
    recomienda: b.recomienda === "Sí" || b.recomienda === true ? true : b.recomienda === "No" || b.recomienda === false ? false : null,
    tiposSuplementos: limpiar(b.tiposSuplementos, 200),
    sourceRef: limpiar(b.sourceRef, 64).replace(/[^\w.\-@]/g, ""),
  };

  const e = {};
  if (d.nombre.length < 2) e.nombre = "Escribe tu nombre";
  if (d.apellido.length < 2) e.apellido = "Escribe tu apellido";
  if (!isValidEmail(d.email)) e.email = "Escribe un correo válido";
  if (!d.telefono) e.telefono = "Escribe tu teléfono a 10 dígitos";
  if (!PROFESIONES.includes(d.profesion)) e.profesion = "Elige tu profesión";
  if (d.profesion === "Otro" && d.otraProfesion.length < 3) e.otraProfesion = "Cuéntanos cuál es";
  if (!/^[A-Z0-9-]{5,15}$/.test(d.cedula)) e.cedula = "Escribe tu cédula profesional";
  if (!Number.isInteger(d.pacientes) || d.pacientes < 0 || d.pacientes > 100000) e.pacientes = "Escribe un número";
  if (d.redSocial.length < 3) e.redSocial = "Escribe tu red social principal";
  if (d.estado.length < 2) e.estado = "Escribe tu estado";
  if (d.ciudad.length < 2) e.ciudad = "Escribe tu ciudad";
  if (d.recomienda === null) e.recomienda = "Elige una opción";
  if (b.terminos !== true) e.terminos = "Debes aceptar los términos para continuar";

  return Object.keys(e).length ? { errores: e } : { datos: d };
}

/** Cómo se guarda la profesión en `affiliates` (igual que lo que ya hay: "Otro - Enfermera"). */
const profesionParaGuardar = (d) =>
  d.profesion === "Otro" ? `Otro - ${d.otraProfesion}` : d.profesion === "Influencer/Blogger de salud" ? "Influencer/Blogger" : d.profesion;

// ── Shopify ──────────────────────────────────────────────────────────────────

const tienda = () => {
  const s = String(process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return s.includes(".") ? s : `${s}.myshopify.com`;
};

async function shopify(ruta, { method = "GET", body } = {}) {
  const res = await fetch(`https://${tienda()}/admin/api/${API_SHOPIFY}/${ruta}`, {
    method,
    headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Shopify ${method} ${ruta.split("?")[0]}: ${res.status} ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
    err.status = res.status;
    err.detalle = json.errors;
    throw err;
  }
  return json;
}

async function buscarCliente(email) {
  const r = await shopify(`customers/search.json?query=${encodeURIComponent(`email:"${email}"`)}&fields=id,email,tags`);
  return (r.customers || []).find((c) => normalizeEmail(c.email) === email) || null;
}

/** Cliente de Shopify de ese correo: el que ya existe (por ejemplo, alguien que ya compró) o uno nuevo. */
async function clienteShopify(d) {
  const existente = await buscarCliente(d.email);
  if (existente) return existente;

  const base = {
    first_name: d.nombre,
    last_name: d.apellido,
    email: d.email,
    tags: "especialista",
    note: d.sourceRef || "",
    verified_email: true,
    // El formulario de la tienda lo mandaba siempre en "true" en un campo oculto
    email_marketing_consent: { state: "subscribed", opt_in_level: "single_opt_in" },
  };
  const intentar = (extra) => shopify("customers.json", { method: "POST", body: { customer: { ...base, ...extra } } });

  try {
    return (await intentar({ phone: `+52${d.telefono}` })).customer;
  } catch (e) {
    // Teléfono ya usado por otra cuenta o con formato que Shopify no acepta: se crea sin él (queda en `affiliates`)
    if (e.status === 422 && /phone/i.test(JSON.stringify(e.detalle ?? ""))) return (await intentar({})).customer;
    // Alguien creó ese correo justo ahora (la búsqueda de Shopify tarda en verlo)
    if (e.status === 422 && /email/i.test(JSON.stringify(e.detalle ?? ""))) {
      const ya = await buscarCliente(d.email);
      if (ya) return ya;
    }
    throw e;
  }
}

const esMetafieldRepetido = (e) => e.status === 422 && /unique|already|taken|ya existe/i.test(JSON.stringify(e.detalle ?? e.message));

async function asegurarEtiqueta(cliente) {
  const tags = String(cliente.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  if (tags.includes("especialista")) return;
  await shopify(`customers/${cliente.id}.json`, { method: "PUT", body: { customer: { id: cliente.id, tags: [...tags, "especialista"].join(", ") } } });
}

async function metafieldCliente(clienteId) {
  try {
    await shopify(`customers/${clienteId}/metafields.json`, {
      method: "POST",
      body: { metafield: { namespace: "custom", key: "referido", type: "single_line_text_field", value: String(clienteId) } },
    });
  } catch (e) {
    if (!esMetafieldRepetido(e)) throw e;
  }
}

async function metafieldColeccion(coleccionId, clienteId) {
  try {
    await shopify("metafields.json", {
      method: "POST",
      body: { metafield: { namespace: "custom", key: "especId", type: "single_line_text_field", value: String(clienteId), owner_id: coleccionId, owner_resource: "collection" } },
    });
  } catch (e) {
    if (!esMetafieldRepetido(e)) throw e;
  }
}

async function crearColeccion(d) {
  const r = await shopify("custom_collections.json", {
    method: "POST",
    body: { custom_collection: { title: `${d.nombre} ${d.apellido}`, published: true, template_suffix: "coleccion-afiliado" } },
  });
  return r.custom_collection;
}

// ── Base de datos ────────────────────────────────────────────────────────────

async function insertarAfiliado(d, clienteId, coleccionId) {
  const { data: ya } = await supabase.from("affiliates").select("id").eq("shopify_customer_id", clienteId).maybeSingle();
  if (ya) return;
  const { error } = await supabase.from("affiliates").insert({
    shopify_customer_id: clienteId,
    shopify_collection_id: coleccionId,
    email: d.email,
    first_name: d.nombre,
    last_name: d.apellido,
    phone: `521${d.telefono}`, // el formato que ya usan los demás afiliados
    profession: profesionParaGuardar(d),
    patient_count: d.pacientes,
    social_media: d.redSocial,
    referral_id: d.sourceRef || "N/A",
    recommends_supplements: d.recomienda,
    supplement_types: d.tiposSuplementos || null,
    city: d.ciudad,
    state: d.estado,
    address: d.direccion || null,
    cedula_profesional: d.cedula,
    status: "active",
    email_verified: true,
  });
  if (error) throw new Error(`affiliates: ${error.message}`);
}

async function guardarRegistro(id, parche) {
  const { data, error } = await supabase
    .from("registro_afiliados")
    .update({ ...parche, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`registro_afiliados: ${error.message}`);
  return data;
}

async function registroReciente(email) {
  const { data } = await supabase
    .from("registro_afiliados")
    .select("*")
    .eq("email", email)
    .neq("paso", "completado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** ¿Ya hay un afiliado con ese correo o esa cédula? (incluye dados de baja: ahí hay que hablar con soporte) */
async function afiliadoExistente(email, cedula) {
  const { data: porCorreo } = await supabase
    .from("affiliates")
    .select("email, status, deleted_at")
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`));
  const fila = (porCorreo || []).find((a) => normalizeEmail(a.email) === email);
  if (fila) return { campo: "email", activo: fila.status === "active" && !fila.deleted_at };

  const { data: porCedula } = await supabase
    .from("affiliates")
    .select("cedula_profesional, status, deleted_at")
    .eq("cedula_profesional", cedula)
    .is("deleted_at", null)
    .limit(1);
  if (porCedula?.length) return { campo: "cedula", activo: true };
  return null;
}

// ── Códigos al correo ────────────────────────────────────────────────────────

async function enviarCodigo(email, nombre, code) {
  const { error } = await resend.emails.send({
    from: "Vitahub Pro <noreply@pro.vitahub.mx>",
    to: email,
    subject: `${code} es tu código para crear tu cuenta de Vitahub Pro`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f7f9fb;border-radius:12px">
        <img src="https://pro.vitahub.mx/LOGO.png" alt="Vitahub Pro" width="137" height="40" style="display:block;border:0;height:40px;width:auto;margin-bottom:24px" />
        <h2 style="color:#1b3f7a;margin:0 0 8px">Confirma tu correo${nombre ? `, ${nombre}` : ""}</h2>
        <p style="color:#555;margin:0 0 24px">Escribe este código en la pantalla de registro para crear tu cuenta de profesional:</p>
        <div style="background:#1b3f7a;color:#fff;font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;border-radius:10px">${code}</div>
        <p style="color:#999;font-size:12px;margin-top:24px">El código vence en ${CODE_TTL_MIN} minutos. Si tú no te estás registrando, ignora este mensaje: no se creó ninguna cuenta.</p>
      </div>`,
    text: `Tu código para crear tu cuenta de Vitahub Pro es ${code}. Vence en ${CODE_TTL_MIN} minutos.`,
    tags: [{ name: "flujo", value: "registro_pro" }],
  });
  if (error) throw new Error(`Resend: ${error.message ?? JSON.stringify(error)}`);
}

/** Genera y manda un código, respetando los límites. Devuelve { ok } o { status, error }. */
async function mandarCodigo(email, nombre, ip) {
  const clave = claveRegistro(email);
  const haceUnaHora = new Date(Date.now() - 3600 * 1000).toISOString();

  const { data: recientes } = await supabase
    .from("customer_app_login_codes")
    .select("created_at")
    .eq("email", clave)
    .gte("created_at", haceUnaHora)
    .order("created_at", { ascending: false });

  const ultimo = recientes?.[0];
  if (ultimo) {
    const seg = Math.floor((Date.now() - new Date(ultimo.created_at)) / 1000);
    if (seg < RESEND_COOLDOWN_SEC) return { status: 429, error: `Espera ${RESEND_COOLDOWN_SEC - seg} segundos para pedir otro código` };
  }
  if ((recientes?.length ?? 0) >= MAX_CODES_PER_EMAIL_HOUR) return { status: 429, error: "Pediste demasiados códigos. Intenta de nuevo en una hora." };
  if (ip) {
    const { count } = await supabase.from("customer_app_login_codes").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", haceUnaHora);
    if ((count ?? 0) >= MAX_CODES_PER_IP_HOUR) return { status: 429, error: "Demasiados intentos. Intenta de nuevo más tarde." };
  }

  const code = generateCode();
  const { error } = await supabase.from("customer_app_login_codes").insert({
    email: clave,
    code_hash: hashCode(clave, code),
    expires_at: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString(),
    ip,
  });
  if (error) throw new Error(error.message);
  await enviarCodigo(email, nombre, code);
  return { ok: true };
}

async function codigoValido(clave, code) {
  const { data: fila } = await supabase
    .from("customer_app_login_codes")
    .select("id, code_hash, expires_at, attempts")
    .eq("email", clave)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!fila || new Date(fila.expires_at) < new Date() || fila.attempts >= MAX_ATTEMPTS) return false;

  if (!safeEqual(fila.code_hash, hashCode(clave, code))) {
    await supabase.from("customer_app_login_codes").update({ attempts: fila.attempts + 1 }).eq("id", fila.id);
    return false;
  }
  const { data: consumido } = await supabase
    .from("customer_app_login_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", fila.id)
    .is("consumed_at", null)
    .select("id");
  return !!consumido?.length;
}

// ── Crear la cuenta (pasos que se pueden reanudar) ───────────────────────────

async function avisarFalla(reg, error) {
  console.error(`[registro afiliado] FALLA · ${reg.id} · ${reg.email} · ${error.message}`);
  const para = (process.env.REGISTRO_ALERTA_EMAIL || process.env.BASELINKER_ALERTA_EMAIL || "").trim();
  if (!para) return;
  try {
    await resend.emails.send({
      from: "Vitahub Pro <noreply@pro.vitahub.mx>",
      to: para.split(",").map((s) => s.trim()).filter(Boolean),
      subject: "Un registro de afiliado se quedó a medias",
      html: `<p>Alguien verificó su correo pero su cuenta de Pro <strong>no se terminó de crear</strong>.</p>
<ul><li><strong>Correo:</strong> ${reg.email}</li><li><strong>Registro:</strong> ${reg.id}</li><li><strong>Error:</strong> ${error.message}</li></ul>
<p>Ya tiene hecho lo que muestra la tabla <code>registro_afiliados</code> (cliente y colección de Shopify si aparecen sus IDs). Puede volver a intentarlo desde la misma pantalla y continuará donde se quedó.</p>`,
      tags: [{ name: "flujo", value: "alerta_registro" }],
    });
  } catch (e) {
    console.error("[registro afiliado] no se pudo mandar el aviso:", e.message);
  }
}

async function crearCuenta(reg) {
  const d = reg.datos;
  let r = await guardarRegistro(reg.id, { intentos_cuenta: (reg.intentos_cuenta || 0) + 1, ultimo_error: null });
  try {
    // 1. Cliente de Shopify (con la etiqueta y su metafield `referido`)
    let clienteId = r.shopify_customer_id;
    if (!clienteId) {
      const cliente = await clienteShopify(d);
      await asegurarEtiqueta(cliente);
      clienteId = cliente.id;
      r = await guardarRegistro(r.id, { shopify_customer_id: clienteId });
    }
    await metafieldCliente(clienteId);

    // 2. Su colección, con `especId`
    let coleccionId = r.shopify_collection_id;
    if (!coleccionId) {
      const coleccion = await crearColeccion(d);
      coleccionId = coleccion.id;
      r = await guardarRegistro(r.id, { shopify_collection_id: coleccionId });
    }
    await metafieldColeccion(coleccionId, clienteId);

    // 3. La fila en `affiliates`
    await insertarAfiliado(d, clienteId, coleccionId);
    r = await guardarRegistro(r.id, { paso: "cuenta_creada", afiliado_creado_at: new Date().toISOString() });

    return { ok: true, clienteId, registro: r };
  } catch (e) {
    r = await guardarRegistro(r.id, { paso: "falla", ultimo_error: String(e.message).slice(0, 500) }).catch(() => r);
    await avisarFalla(r, e);
    return { ok: false, error: e.message };
  }
}

const sesionDe = (d, clienteId) => ({
  token: signCustomerToken(String(clienteId), d.email),
  customer: { id: String(clienteId), firstName: d.nombre, lastName: d.apellido, email: d.email, phone: `521${d.telefono}` },
});

const ERROR_CUENTA = "Confirmamos tu correo, pero tuvimos un problema al crear tu cuenta. Ya avisamos al equipo; puedes volver a intentarlo.";

// Si la cuenta falla después de confirmar el correo, quien se registra recibe un pase firmado de 30 minutos para
// reintentar sin pedir otro código. Sin él, reintentar con solo el correo dejaría entrar a cualquiera.
const claveFirma = () => process.env.SHOPIFY_TOKEN_SECRET;
const firmaPase = (id, exp) => crypto.createHmac("sha256", claveFirma()).update(`registro:${id}:${exp}`).digest("hex");
const pase = (id) => {
  const exp = Date.now() + 30 * 60 * 1000;
  return `${id}.${exp}.${firmaPase(id, exp)}`;
};
function leerPase(valor) {
  const [id, exp, firma] = String(valor ?? "").split(".");
  if (!id || !exp || !firma || Number(exp) < Date.now() || !safeEqual(firma, firmaPase(id, exp))) return null;
  return id;
}
const falla = () => ({ status: 500, json: { ok: false, paso: "falla", error: ERROR_CUENTA } });

// ── Lo que usan las rutas ────────────────────────────────────────────────────

/** Paso 1: valida, revisa duplicados y manda el código. */
export async function iniciarRegistro(body, ip) {
  const v = validarDatos(body);
  if (v.bot) return { status: 200, json: { ok: true } }; // al bot se le dice que salió bien y no se hace nada
  if (v.errores) return { status: 400, json: { ok: false, errores: v.errores, error: "Revisa los campos marcados" } };
  const d = v.datos;

  const existente = await afiliadoExistente(d.email, d.cedula);
  if (existente) {
    return {
      status: 409,
      json: {
        ok: false,
        yaExiste: true,
        campo: existente.campo,
        error: existente.campo === "email"
          ? existente.activo
            ? "Ya tienes una cuenta con este correo. Entra con tu correo y un código."
            : "Ese correo ya estuvo registrado. Escríbenos a soporte para reactivar tu cuenta."
          : "Esa cédula ya está registrada. Si es tu cuenta, entra con tu correo y un código.",
      },
    };
  }

  const haceUnaHora = new Date(Date.now() - 3600 * 1000).toISOString();
  if (ip) {
    const { count } = await supabase.from("registro_afiliados").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", haceUnaHora);
    if ((count ?? 0) >= 10) return { status: 429, json: { ok: false, error: "Demasiados intentos desde esta conexión. Intenta de nuevo más tarde." } };
  }

  let reg = await registroReciente(d.email);
  if (reg) reg = await guardarRegistro(reg.id, { datos: d, source_ref: d.sourceRef || null, paso: reg.verificado_at ? reg.paso : "datos" });
  else {
    const { data, error } = await supabase
      .from("registro_afiliados")
      .insert({ email: d.email, datos: d, source_ref: d.sourceRef || null, ip, paso: "datos" })
      .select()
      .single();
    if (error) throw new Error(`registro_afiliados: ${error.message}`);
    reg = data;
  }

  // Siempre se pide el código, aunque ese correo ya se hubiera verificado antes: si no, cualquiera que
  // escribiera el correo de otra persona recibiría su sesión.
  const envio = await mandarCodigo(d.email, d.nombre, ip);
  if (!envio.ok) return { status: envio.status, json: { ok: false, error: envio.error } };
  return { status: 200, json: { ok: true, cooldown: RESEND_COOLDOWN_SEC } };
}

/** Reenvía el código de un registro que ya está en curso. */
export async function reenviarCodigo(emailCrudo, ip) {
  const email = normalizeEmail(emailCrudo);
  const reg = isValidEmail(email) ? await registroReciente(email) : null;
  if (!reg || reg.verificado_at) return { status: 200, json: { ok: true, cooldown: RESEND_COOLDOWN_SEC } }; // no se revela nada
  const envio = await mandarCodigo(email, reg.datos?.nombre, ip);
  if (!envio.ok) return { status: envio.status, json: { ok: false, error: envio.error } };
  return { status: 200, json: { ok: true, cooldown: RESEND_COOLDOWN_SEC } };
}

/** Paso 2: confirma el código y crea la cuenta. */
export async function verificarYCrear(emailCrudo, codigoCrudo) {
  const email = normalizeEmail(emailCrudo);
  const code = String(codigoCrudo ?? "").replace(/\D/g, "");
  const INVALIDO = "El código es incorrecto o ya venció. Revisa tu correo o pide uno nuevo.";
  if (!isValidEmail(email) || code.length !== 6) return { status: 400, json: { ok: false, error: "Escribe el código de 6 dígitos" } };

  const reg = await registroReciente(email);
  if (!reg) return { status: 401, json: { ok: false, error: INVALIDO } };
  if (!(await codigoValido(claveRegistro(email), code))) return { status: 401, json: { ok: false, error: INVALIDO } };

  const verificado = await guardarRegistro(reg.id, { paso: "verificado", verificado_at: reg.verificado_at || new Date().toISOString() });
  const hecho = await crearCuenta(verificado);
  if (!hecho.ok) { const f = falla(); f.json.reintento = pase(verificado.id); return f; }
  return { status: 200, json: { ok: true, cuentaLista: true, ...sesionDe(verificado.datos, hecho.clienteId) } };
}

/** Reintenta crear la cuenta de alguien que ya verificó su correo y a quien la cuenta le falló a la mitad. */
export async function reintentarCuenta(paseCrudo) {
  const id = leerPase(paseCrudo);
  if (!id) return { status: 401, json: { ok: false, error: "Pasó mucho tiempo. Vuelve a empezar y te mandamos otro código." } };
  const { data: reg } = await supabase.from("registro_afiliados").select("*").eq("id", id).maybeSingle();
  if (!reg || !reg.verificado_at) return { status: 400, json: { ok: false, error: "Primero confirma tu correo." } };
  const hecho = await crearCuenta(reg);
  if (!hecho.ok) { const f = falla(); f.json.reintento = pase(reg.id); return f; }
  return { status: 200, json: { ok: true, cuentaLista: true, ...sesionDe(reg.datos, hecho.clienteId) } };
}

/** El registro terminó: la persona ya entró a Pro. */
export async function marcarCompletado(emailCrudo) {
  const email = normalizeEmail(emailCrudo);
  const reg = isValidEmail(email) ? await registroReciente(email) : null;
  if (reg?.paso === "cuenta_creada") await guardarRegistro(reg.id, { paso: "completado", completado_at: new Date().toISOString() });
}
