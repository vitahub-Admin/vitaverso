"use client";

// Registro de afiliados desde Pro. Cuatro pasos: tus datos (dos pantallas cortas) → confirma tu correo con un
// código → agenda con tu asesor → listo. El servidor (src/lib/registroAfiliado.js) crea la cuenta solo después de
// confirmar el correo; aquí está todo lo que se ve y se anima. Las animaciones viven en globals.css (prefijo reg-)
// y se apagan solas si la persona pidió reducir el movimiento.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Cookies from "js-cookie";
import {
  ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Check, ChevronDown, ClipboardList, Loader2, Mail, PackageCheck,
  ShieldCheck, Sparkles, Users,
} from "lucide-react";

const TERMINOS = "https://vitahub.mx/pages/terminos-y-condiciones-para-profesionales-de-la-salud-en-vitahub";
const AGENDA =
  process.env.NEXT_PUBLIC_REGISTRO_AGENDA_URL ||
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ326h_upRLNXippR4Cjr3f2oDNG9TeoGjSiaQghRfXNrCFPgEMfsXKmrqPj6abBASPSAGfzdA4_?gv=true";
const VIDEO = process.env.NEXT_PUBLIC_REGISTRO_VIDEO_URL || "";
const POSTER = process.env.NEXT_PUBLIC_REGISTRO_VIDEO_POSTER || "";
const GUARDADO = "vh_registro_v1";

const PROFESIONES = [
  "Médico", "Nutricionista", "Dietista", "Fisioterapeuta", "Quiropráctico", "Entrenador Personal",
  "Preparador Físico", "Instructor de Gimnasio", "Coach Deportivo", "Health Coach", "Wellness Coach",
  "Life Coach", "Influencer/Blogger de salud", "Dueño de Gimnasio", "Asesor de Suplementos", "Otro",
];

const VACIO = {
  nombre: "", apellido: "", email: "", telefono: "", profesion: "", otraProfesion: "", cedula: "",
  pacientes: "", redSocial: "", estado: "", ciudad: "", direccion: "", recomienda: "", tiposSuplementos: "",
  terminos: false, sitio: "",
};
const CAMPOS_A = ["nombre", "apellido", "email", "telefono"];

const PASOS = [
  { id: "datos", etiqueta: "Tus datos" },
  { id: "codigo", etiqueta: "Tu correo" },
  { id: "agenda", etiqueta: "Tu asesor" },
  { id: "listo", etiqueta: "Listo" },
];
const indicePaso = (pantalla) => (pantalla === "a" || pantalla === "b" ? 0 : pantalla === "codigo" ? 1 : pantalla === "agenda" ? 2 : 3);

// ── Validación en pantalla (el servidor repite todo y manda más) ──────────────

const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");
function telefono10(raw) {
  let d = soloDigitos(raw);
  if (d.length >= 12 && d.startsWith("521")) d = d.slice(3);
  else if (d.length >= 12 && d.startsWith("52")) d = d.slice(2);
  return d.length === 10 ? d : "";
}

function revisar(f, campos) {
  const e = {};
  const t = (v) => String(v ?? "").trim();
  const reglas = {
    nombre: () => t(f.nombre).length < 2 && "Escribe tu nombre",
    apellido: () => t(f.apellido).length < 2 && "Escribe tu apellido",
    email: () => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t(f.email)) && "Escribe un correo válido",
    telefono: () => !telefono10(f.telefono) && "Escribe tu teléfono a 10 dígitos",
    profesion: () => !PROFESIONES.includes(f.profesion) && "Elige tu profesión",
    otraProfesion: () => f.profesion === "Otro" && t(f.otraProfesion).length < 3 && "Cuéntanos cuál es",
    cedula: () => !/^[A-Za-z0-9-]{5,15}$/.test(t(f.cedula)) && "Escribe tu cédula profesional",
    pacientes: () => !(Number.isInteger(Number(f.pacientes)) && t(f.pacientes) !== "" && Number(f.pacientes) >= 0) && "Escribe un número",
    redSocial: () => t(f.redSocial).length < 3 && "Escribe tu red social principal",
    estado: () => t(f.estado).length < 2 && "Escribe tu estado",
    ciudad: () => t(f.ciudad).length < 2 && "Escribe tu ciudad",
    recomienda: () => !["Sí", "No"].includes(f.recomienda) && "Elige una opción",
    terminos: () => !f.terminos && "Debes aceptar los términos para continuar",
  };
  for (const c of campos) {
    const m = reglas[c]?.();
    if (m) e[c] = m;
  }
  return e;
}

async function api(accion, cuerpo = {}) {
  try {
    const res = await fetch("/api/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion, ...cuerpo }),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  } catch {
    return { status: 0, ok: false, error: "Sin conexión. Revisa tu internet e intenta de nuevo." };
  }
}

// ── Piezas de interfaz ────────────────────────────────────────────────────────

const claseInput = (error) =>
  `w-full rounded-xl border bg-white px-3.5 py-3 text-[15px] text-[#0D2133] placeholder:text-[#9db3c0] outline-none transition
   focus:border-[#2BB9B8] focus:ring-4 focus:ring-[#2BB9B8]/15 ${error ? "border-red-400 bg-red-50/40" : "border-[#D0E4EC] hover:border-[#9fd9d8]"}`;

function Campo({ id, etiqueta, error, ayuda, opcional, children, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-[13px] font-bold text-[#1b3f7a]">
        <span>{etiqueta}</span>
        {opcional && <span className="text-[11px] font-normal text-[#8AAAB8]">Opcional</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="reg-subir mt-1.5 text-[12px] font-medium text-red-500">{error}</p>
      ) : ayuda ? (
        <p className="mt-1.5 text-[12px] text-[#8AAAB8]">{ayuda}</p>
      ) : null}
    </div>
  );
}

function Boton({ children, cargando, className = "", ...props }) {
  return (
    <button
      {...props}
      disabled={cargando || props.disabled}
      className={`reg-brillo relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#1b3f7a] to-[#2a5298]
        px-5 py-3.5 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(27,63,122,0.7)] transition
        hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-10px_rgba(27,63,122,0.75)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {cargando ? <Loader2 size={18} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

function Estacion({ i, activo, hecho, etiqueta }) {
  return (
    <li className="flex flex-1 flex-col items-center gap-1.5">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-[13px] font-extrabold transition-all duration-500 ${
          hecho
            ? "border-[#2BB9B8] bg-[#2BB9B8] text-[#0D2133]"
            : activo
              ? "reg-pulso border-[#1b3f7a] bg-[#1b3f7a] text-white"
              : "border-[#D0E4EC] bg-white text-[#9db3c0]"
        }`}
      >
        {hecho ? <Check size={17} strokeWidth={3} className="reg-pop" /> : i + 1}
      </span>
      <span className={`text-center text-[11px] font-bold leading-tight ${activo || hecho ? "text-[#1b3f7a]" : "text-[#9db3c0]"} ${activo ? "" : "hidden sm:block"}`}>
        {etiqueta}
      </span>
    </li>
  );
}

function Progreso({ actual }) {
  const avance = (actual / (PASOS.length - 1)) * 100;
  return (
    <nav aria-label="Progreso del registro" className="mb-7">
      <div className="relative">
        <div className="absolute left-[12.5%] right-[12.5%] top-[17px] h-[3px] rounded-full bg-[#E3EEF3]">
          <div
            className="reg-barra-viva h-full rounded-full bg-[length:32px_100%] transition-[width] duration-700 ease-out"
            style={{
              width: `${avance}%`,
              backgroundImage: "repeating-linear-gradient(110deg, #2BB9B8 0 12px, #5fd3d2 12px 24px)",
            }}
          />
        </div>
        <ol className="relative flex">
          {PASOS.map((p, i) => (
            <Estacion key={p.id} i={i} etiqueta={p.etiqueta} activo={i === actual} hecho={i < actual} />
          ))}
        </ol>
      </div>
    </nav>
  );
}

// ── Panel de marca (escritorio) ───────────────────────────────────────────────

const BENEFICIOS = [
  { Icono: ClipboardList, texto: "Protocolos con dosis, horario e indicaciones, listos en minutos" },
  { Icono: Users, texto: "Seguimiento de cada paciente y aviso de cuándo se le termina el producto" },
  { Icono: PackageCheck, texto: "Más de 2,000 suplementos, todos 100% originales" },
  { Icono: CalendarDays, texto: "Agenda en línea y la app Mi Vitahub para tus pacientes" },
];

const EJEMPLO = [
  { n: "Vitamina D3 5000 UI", t: "Tomar 1 softgel con el desayuno" },
  { n: "Magnesio glicinato", t: "Tomar 2 cápsulas por la noche" },
  { n: "Omega 3 EPA/DHA", t: "Tomar 1 softgel con la comida" },
];

function PanelMarca() {
  return (
    <aside className="relative hidden overflow-hidden bg-[radial-gradient(120%_90%_at_0%_0%,#23559f_0%,#1b3f7a_38%,#0D2133_100%)] text-white lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12 xl:px-16">
      {/* Atmósfera: manchas que derivan y una rejilla de puntos */}
      <div aria-hidden className="reg-deriva pointer-events-none absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-[#2BB9B8]/30 blur-[90px]" />
      <div aria-hidden style={{ "--d": "-6s" }} className="reg-deriva pointer-events-none absolute -bottom-20 right-[-4rem] h-96 w-96 rounded-full bg-[#1E8FA8]/35 blur-[100px]" />
      <div aria-hidden className="reg-grano pointer-events-none absolute inset-0" />

      <div className="relative z-10">
        <div className="reg-subir inline-flex items-center rounded-2xl bg-white px-4 py-2.5 shadow-lg shadow-black/20">
          <img src="/LOGO.png" alt="Vitahub Pro" className="h-8 w-auto" />
        </div>

        <p style={{ "--d": "0.1s" }} className="reg-subir mt-14 text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#7eb8c9]">
          Para profesionales de la salud
        </p>
        <h1 style={{ "--d": "0.18s" }} className="reg-subir mt-3 max-w-md text-[2.6rem] font-extrabold leading-[1.08] tracking-tight xl:text-5xl">
          Recomienda con respaldo.
          <span className="block bg-gradient-to-r from-[#2BB9B8] to-[#9fe7e6] bg-clip-text text-transparent">Da seguimiento con datos.</span>
        </h1>
        <p style={{ "--d": "0.26s" }} className="reg-subir mt-4 max-w-md text-[15px] leading-relaxed text-white/75">
          Arma protocolos de suplementación en minutos y acompaña a cada paciente hasta que termina su tratamiento.
        </p>

        <ul className="mt-9 max-w-md space-y-3.5">
          {BENEFICIOS.map(({ Icono, texto }, i) => (
            <li key={texto} style={{ "--d": `${0.38 + i * 0.1}s` }} className="reg-subir flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 backdrop-blur">
                <Icono size={16} className="text-[#2BB9B8]" />
              </span>
              <span className="text-[14px] leading-snug text-white/90">{texto}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Vista de ejemplo de un protocolo, para que se vea qué van a mandar */}
      <div className="relative z-10 mt-10 hidden xl:block">
        <div style={{ "--r": "-2deg", "--d": "-2s" }} className="reg-flotar ml-auto w-[22rem] rounded-2xl bg-white p-4 text-[#0D2133] shadow-2xl shadow-black/30">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#8AAAB8]">Protocolo de</p>
              <p className="text-[15px] font-extrabold text-[#1b3f7a]">Ana Gómez</p>
            </div>
            <span className="rounded-full bg-[#E6F4F8] px-2.5 py-1 text-[10px] font-extrabold text-[#1E8FA8]">Vista de ejemplo</span>
          </div>
          <ul className="space-y-2.5">
            {EJEMPLO.map((p, i) => (
              <li key={p.n} style={{ "--d": `${1.1 + i * 0.35}s` }} className="reg-subir flex items-center gap-3 rounded-xl border border-[#E3EEF3] bg-[#F7F9FB] p-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2BB9B8]/15">
                  <Check size={16} strokeWidth={3} className="text-[#1E8FA8]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-[#1b3f7a]">{p.n}</span>
                  <span className="mt-0.5 inline-block rounded-full bg-[#2BB9B8] px-2 py-0.5 text-[10px] font-bold text-[#0D2133]">{p.t}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="relative z-10 mt-8 flex items-center gap-2 text-[12px] text-white/55">
        <ShieldCheck size={14} /> Tus datos se usan solo para validar tu perfil profesional.
      </p>
    </aside>
  );
}

function CabeceraMovil() {
  return (
    <header className="relative overflow-hidden bg-[radial-gradient(120%_140%_at_0%_0%,#23559f_0%,#1b3f7a_45%,#0D2133_100%)] px-5 pb-8 pt-6 text-white lg:hidden">
      <div aria-hidden className="reg-deriva pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#2BB9B8]/35 blur-[50px]" />
      <div className="relative flex items-center justify-between">
        <span className="inline-flex rounded-xl bg-white px-3 py-1.5"><img src="/LOGO.png" alt="Vitahub Pro" className="h-6 w-auto" /></span>
        <Link href="/wallet" className="text-[12px] font-bold text-white/80 underline-offset-4 hover:underline">Ya tengo cuenta</Link>
      </div>
      <h1 className="reg-subir relative mt-6 text-[1.65rem] font-extrabold leading-tight">
        Crea tu cuenta <span className="text-[#2BB9B8]">de profesional</span>
      </h1>
      <p className="relative mt-1.5 text-[13px] text-white/75">Protocolos, seguimiento de pacientes y más de 2,000 suplementos originales.</p>
    </header>
  );
}

// ── Pantallas ─────────────────────────────────────────────────────────────────

function PantallaA({ f, e, poner, tocar, continuar }) {
  return (
    <form onSubmit={(ev) => { ev.preventDefault(); continuar(); }} noValidate className="space-y-4">
      <div>
        <h2 className="text-[1.45rem] font-extrabold leading-tight text-[#0D2133]">Cuéntanos quién eres</h2>
        <p className="mt-1 text-[14px] text-[#5B7A8C]">Son dos pantallas cortas. Te toma menos de 3 minutos.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nombre" etiqueta="Nombre" error={e.nombre}>
          <input id="nombre" autoComplete="given-name" value={f.nombre} onChange={poner("nombre")} onBlur={tocar("nombre")} aria-invalid={!!e.nombre} className={claseInput(e.nombre)} />
        </Campo>
        <Campo id="apellido" etiqueta="Apellido" error={e.apellido}>
          <input id="apellido" autoComplete="family-name" value={f.apellido} onChange={poner("apellido")} onBlur={tocar("apellido")} aria-invalid={!!e.apellido} className={claseInput(e.apellido)} />
        </Campo>
      </div>

      <Campo id="email" etiqueta="Correo electrónico" error={e.email} ayuda="Te mandaremos un código para confirmarlo. Con este correo entrarás siempre.">
        <input id="email" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={poner("email")} onBlur={tocar("email")} aria-invalid={!!e.email} placeholder="tucorreo@ejemplo.com" className={claseInput(e.email)} />
      </Campo>

      <Campo id="telefono" etiqueta="Teléfono (WhatsApp)" error={e.telefono}>
        <div className="flex">
          <span className="flex items-center rounded-l-xl border border-r-0 border-[#D0E4EC] bg-[#F7F9FB] px-3 text-[14px] font-bold text-[#5B7A8C]">🇲🇽 +52</span>
          <input id="telefono" type="tel" inputMode="tel" autoComplete="tel-national" value={f.telefono} onChange={poner("telefono")} onBlur={tocar("telefono")} aria-invalid={!!e.telefono} placeholder="10 dígitos" className={`${claseInput(e.telefono)} rounded-l-none`} />
        </div>
      </Campo>

      {/* Campo trampa: una persona no lo ve; un bot lo llena */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Sitio web<input tabIndex={-1} autoComplete="off" value={f.sitio} onChange={poner("sitio")} /></label>
      </div>

      <Boton type="submit" className="mt-2">Continuar <ArrowRight size={18} /></Boton>
    </form>
  );
}

function PantallaB({ f, e, poner, tocar, poner2, volver, enviar, enviando, errorGeneral, yaExiste }) {
  return (
    <form onSubmit={(ev) => { ev.preventDefault(); enviar(); }} noValidate className="space-y-4">
      <div>
        <button type="button" onClick={volver} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#5B7A8C] transition hover:text-[#1b3f7a]">
          <ArrowLeft size={15} /> Atrás
        </button>
        <h2 className="text-[1.45rem] font-extrabold leading-tight text-[#0D2133]">Tu práctica profesional</h2>
        <p className="mt-1 text-[14px] text-[#5B7A8C]">Validamos tu perfil para mantener la plataforma solo para profesionales.</p>
      </div>

      <Campo id="profesion" etiqueta="Profesión" error={e.profesion}>
        <div className="relative">
          <select id="profesion" value={f.profesion} onChange={poner("profesion")} onBlur={tocar("profesion")} aria-invalid={!!e.profesion} className={`${claseInput(e.profesion)} appearance-none pr-10`}>
            <option value="">Selecciona una profesión</option>
            {PROFESIONES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <ChevronDown size={18} aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5B7A8C]" />
        </div>
      </Campo>

      {f.profesion === "Otro" && (
        <Campo id="otraProfesion" etiqueta="¿Cuál?" error={e.otraProfesion} className="reg-subir">
          <input id="otraProfesion" value={f.otraProfesion} onChange={poner("otraProfesion")} onBlur={tocar("otraProfesion")} aria-invalid={!!e.otraProfesion} placeholder="Ej: Enfermera" className={claseInput(e.otraProfesion)} />
        </Campo>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="cedula" etiqueta="Cédula profesional" error={e.cedula}>
          <input id="cedula" value={f.cedula} onChange={poner("cedula")} onBlur={tocar("cedula")} aria-invalid={!!e.cedula} placeholder="Ej: 12345678" className={claseInput(e.cedula)} />
        </Campo>
        <Campo id="pacientes" etiqueta="Pacientes que atiendes" error={e.pacientes}>
          <input id="pacientes" type="number" inputMode="numeric" min="0" value={f.pacientes} onChange={poner("pacientes")} onBlur={tocar("pacientes")} aria-invalid={!!e.pacientes} placeholder="Ej: 20" className={claseInput(e.pacientes)} />
        </Campo>
      </div>

      <Campo id="redSocial" etiqueta="Red social principal" error={e.redSocial}>
        <input id="redSocial" value={f.redSocial} onChange={poner("redSocial")} onBlur={tocar("redSocial")} aria-invalid={!!e.redSocial} placeholder="Ej: Instagram @tunombre" className={claseInput(e.redSocial)} />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="estado" etiqueta="Estado" error={e.estado}>
          <input id="estado" autoComplete="address-level1" value={f.estado} onChange={poner("estado")} onBlur={tocar("estado")} aria-invalid={!!e.estado} placeholder="Ej: Ciudad de México" className={claseInput(e.estado)} />
        </Campo>
        <Campo id="ciudad" etiqueta="Ciudad" error={e.ciudad}>
          <input id="ciudad" autoComplete="address-level2" value={f.ciudad} onChange={poner("ciudad")} onBlur={tocar("ciudad")} aria-invalid={!!e.ciudad} placeholder="Ej: Ciudad de México" className={claseInput(e.ciudad)} />
        </Campo>
      </div>

      <Campo id="direccion" etiqueta="Dirección de tu consultorio" opcional>
        <input id="direccion" autoComplete="street-address" value={f.direccion} onChange={poner("direccion")} placeholder="Ej: Calle 123, colonia" className={claseInput(false)} />
      </Campo>

      <div>
        <p className="mb-1.5 text-[13px] font-bold text-[#1b3f7a]">¿Recomiendas suplementos a tus pacientes?</p>
        <div role="radiogroup" aria-label="Recomiendas suplementos" className="grid grid-cols-2 gap-2.5">
          {["Sí", "No"].map((op) => (
            <button
              key={op}
              type="button"
              role="radio"
              aria-checked={f.recomienda === op}
              onClick={() => poner2("recomienda", op)}
              className={`rounded-xl border-2 px-4 py-3 text-[14px] font-bold transition ${
                f.recomienda === op ? "border-[#1b3f7a] bg-[#1b3f7a] text-white shadow-md" : "border-[#D0E4EC] bg-white text-[#5B7A8C] hover:border-[#9fd9d8]"
              }`}
            >
              {op}
            </button>
          ))}
        </div>
        {e.recomienda && <p role="alert" className="reg-subir mt-1.5 text-[12px] font-medium text-red-500">{e.recomienda}</p>}
      </div>

      {f.recomienda === "Sí" && (
        <Campo id="tiposSuplementos" etiqueta="¿Cuáles recomiendas?" opcional className="reg-subir">
          <input id="tiposSuplementos" value={f.tiposSuplementos} onChange={poner("tiposSuplementos")} placeholder="Ej: proteína, creatina, multivitamínicos" className={claseInput(false)} />
        </Campo>
      )}

      <div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E3EEF3] bg-[#F7F9FB] p-3.5">
          <input type="checkbox" checked={f.terminos} onChange={(ev) => poner2("terminos", ev.target.checked)} className="peer sr-only" />
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-[#9db3c0] bg-white transition peer-checked:border-[#1b3f7a] peer-checked:bg-[#1b3f7a] peer-focus-visible:ring-4 peer-focus-visible:ring-[#2BB9B8]/25 [&>svg]:scale-0 peer-checked:[&>svg]:scale-100">
            <Check size={13} strokeWidth={3.5} className="text-white transition-transform duration-200" />
          </span>
          <span className="text-[13px] leading-snug text-[#5B7A8C]">
            Acepto los{" "}
            <a href={TERMINOS} target="_blank" rel="noopener noreferrer" className="font-bold text-[#1b3f7a] underline underline-offset-2" onClick={(ev) => ev.stopPropagation()}>
              términos y condiciones de profesionales
            </a>
            .
          </span>
        </label>
        {e.terminos && <p role="alert" className="reg-subir mt-1.5 text-[12px] font-medium text-red-500">{e.terminos}</p>}
      </div>

      {errorGeneral && (
        <div role="alert" className="reg-tic rounded-xl border border-red-200 bg-red-50 p-3.5 text-[13px] text-red-700">
          {errorGeneral}
          {yaExiste && (
            <Link href="/wallet" className="mt-2 flex items-center gap-1.5 font-extrabold text-[#1b3f7a] underline underline-offset-2">
              Entrar a mi cuenta <ArrowRight size={14} />
            </Link>
          )}
        </div>
      )}

      <Boton type="submit" cargando={enviando}>
        {enviando ? "Enviando código…" : (<>Enviar código a mi correo <Mail size={17} /></>)}
      </Boton>
    </form>
  );
}

function PantallaCodigo({ email, volver, verificar, verificando, error, reenviar, espera, aviso, reintento, reintentar }) {
  const [digitos, setDigitos] = useState(["", "", "", "", "", ""]);
  const refs = useRef([]);
  const [sacudir, setSacudir] = useState(0);

  useEffect(() => { refs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (error) { setSacudir((n) => n + 1); setDigitos(["", "", "", "", "", ""]); refs.current[0]?.focus(); }
  }, [error]);

  const completar = useCallback((arr) => {
    const code = arr.join("");
    if (code.length === 6 && !verificando) verificar(code);
  }, [verificar, verificando]);

  const cambiar = (i, v) => {
    const d = soloDigitos(v);
    if (!d) { setDigitos((a) => a.map((x, j) => (j === i ? "" : x))); return; }
    const nuevo = [...digitos];
    d.split("").slice(0, 6 - i).forEach((c, k) => { nuevo[i + k] = c; });
    setDigitos(nuevo);
    refs.current[Math.min(i + d.length, 5)]?.focus();
    completar(nuevo);
  };
  const teclas = (i, ev) => {
    if (ev.key === "Backspace" && !digitos[i] && i > 0) refs.current[i - 1]?.focus();
    if (ev.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (ev.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  };

  return (
    <div className="space-y-5">
      <div>
        <button type="button" onClick={volver} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#5B7A8C] transition hover:text-[#1b3f7a]">
          <ArrowLeft size={15} /> Cambiar mis datos
        </button>
        <div className="reg-pop mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2BB9B8]/15 text-[#1E8FA8]"><Mail size={24} /></div>
        <h2 className="text-[1.45rem] font-extrabold leading-tight text-[#0D2133]">Revisa tu correo</h2>
        <p className="mt-1 text-[14px] text-[#5B7A8C]">
          Mandamos un código de 6 dígitos a <strong className="break-all text-[#1b3f7a]">{email}</strong>. Escríbelo aquí para crear tu cuenta.
        </p>
      </div>

      <div key={sacudir} className={`flex justify-between gap-2 ${error ? "reg-tic" : ""}`} role="group" aria-label="Código de 6 dígitos">
        {digitos.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            value={d}
            onChange={(ev) => cambiar(i, ev.target.value)}
            onKeyDown={(ev) => teclas(i, ev)}
            onFocus={(ev) => ev.target.select()}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={6}
            aria-label={`Dígito ${i + 1}`}
            disabled={verificando}
            className={`h-14 w-full min-w-0 rounded-xl border-2 bg-white text-center text-[1.5rem] font-extrabold text-[#1b3f7a] outline-none transition
              focus:border-[#2BB9B8] focus:ring-4 focus:ring-[#2BB9B8]/20 disabled:opacity-60 ${error ? "border-red-400" : d ? "border-[#1b3f7a]" : "border-[#D0E4EC]"}`}
          />
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-[13px] text-red-700">
          {error}
          {reintento && (
            <button type="button" onClick={reintentar} disabled={verificando} className="mt-2 flex items-center gap-1.5 font-extrabold text-[#1b3f7a] underline underline-offset-2">
              Volver a intentar <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
      {aviso && !error && <p className="reg-subir rounded-xl bg-[#E6F4F8] p-3 text-[13px] font-medium text-[#1E8FA8]">{aviso}</p>}

      <div className="flex items-center justify-between text-[13px]">
        <span className="text-[#8AAAB8]">¿No llegó? Mira en spam.</span>
        <button type="button" onClick={reenviar} disabled={espera > 0 || verificando} className="font-extrabold text-[#1b3f7a] transition hover:underline disabled:cursor-not-allowed disabled:text-[#9db3c0] disabled:no-underline">
          {espera > 0 ? `Reenviar en ${espera} s` : "Reenviar código"}
        </button>
      </div>
    </div>
  );
}

// Mientras Shopify trabaja (unos segundos) se le muestra qué se está preparando
function CreandoCuenta({ terminado }) {
  const pasos = ["Correo confirmado", "Creando tu perfil de profesional", "Preparando tu tienda y tu enlace", "Casi listo"];
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((x) => Math.min(x + 1, pasos.length - 1)), 1700);
    return () => clearInterval(t);
  }, []);
  const hasta = terminado ? pasos.length : n;
  return (
    <div className="reg-subir absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl bg-white/95 p-8 backdrop-blur-sm">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1b3f7a] text-white shadow-lg">
        <Sparkles size={28} className="animate-pulse" />
      </div>
      <h3 className="text-[1.2rem] font-extrabold text-[#0D2133]">Creando tu cuenta</h3>
      <ul className="mt-5 w-full max-w-xs space-y-3">
        {pasos.map((p, i) => (
          <li key={p} className={`flex items-center gap-3 text-[14px] transition-opacity duration-500 ${i <= hasta ? "opacity-100" : "opacity-30"}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${i < hasta ? "bg-[#2BB9B8] text-[#0D2133]" : "bg-[#E3EEF3] text-[#5B7A8C]"}`}>
              {i < hasta ? <Check size={14} strokeWidth={3.5} className="reg-pop" /> : i === hasta ? <Loader2 size={14} className="animate-spin" /> : null}
            </span>
            <span className={i < hasta ? "font-bold text-[#1b3f7a]" : "text-[#5B7A8C]"}>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PantallaAgenda({ nombre, siguiente }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="reg-pop mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2BB9B8]/15 text-[#1E8FA8]"><CalendarDays size={24} /></div>
        <h2 className="text-[1.45rem] font-extrabold leading-tight text-[#0D2133]">¡Tu cuenta está lista{nombre ? `, ${nombre}` : ""}!</h2>
        <p className="mt-1 text-[14px] text-[#5B7A8C]">
          Agenda una llamada corta con tu asesor: te enseña la plataforma y valida tu cédula. Es opcional, pero ayuda mucho.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#D0E4EC] bg-white shadow-sm">
        <iframe title="Agenda tu llamada de bienvenida" src={AGENDA} className="h-[560px] w-full border-0" loading="lazy" />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Boton type="button" onClick={siguiente}>Ya agendé mi llamada <Check size={17} /></Boton>
        <button type="button" onClick={siguiente} className="rounded-xl border-2 border-[#D0E4EC] bg-white px-5 py-3.5 text-[15px] font-bold text-[#5B7A8C] transition hover:border-[#9fd9d8] hover:text-[#1b3f7a]">
          Lo haré después
        </button>
      </div>
    </div>
  );
}

function Confeti() {
  const piezas = useMemo(() => {
    const colores = ["#2BB9B8", "#1b3f7a", "#9fe7e6", "#2a5298", "#E6F4F8"];
    return Array.from({ length: 30 }, (_, i) => ({
      i,
      izq: `${(i * 37) % 100}%`,
      color: colores[i % colores.length],
      d: `${(i % 10) * 0.07}s`,
      dx: `${((i * 53) % 90) - 45}px`,
      rot: `${360 + ((i * 97) % 540)}deg`,
      w: 6 + (i % 3) * 3,
    }));
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden">
      {piezas.map((p) => (
        <span key={p.i} className="reg-confeti absolute top-0 block rounded-[2px]" style={{ left: p.izq, width: p.w, height: p.w * 1.6, background: p.color, "--d": p.d, "--dx": p.dx, "--rot": p.rot }} />
      ))}
    </div>
  );
}

function PantallaListo({ nombre, entrar }) {
  const proximos = [
    { Icono: BadgeCheck, t: "Completa tu perfil", d: "Foto, presentación y redes, para que tus pacientes te reconozcan." },
    { Icono: ClipboardList, t: "Arma tu primer protocolo", d: "Elige los suplementos, la dosis y cuándo tomarlos." },
    { Icono: Users, t: "Compártelo con tu paciente", d: "Lo recibe por correo y lo sigue en la app Mi Vitahub." },
  ];
  return (
    <div className="relative space-y-5 text-center">
      <Confeti />
      <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#2BB9B8] to-[#1E8FA8] shadow-[0_14px_30px_-10px_rgba(43,185,184,0.8)]">
        <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path className="reg-trazo" d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </div>
      <div className="relative">
        <h2 className="text-[1.7rem] font-extrabold leading-tight text-[#0D2133]">¡Bienvenido a Vitahub Pro{nombre ? `, ${nombre}` : ""}!</h2>
        <p className="mx-auto mt-2 max-w-sm text-[14px] text-[#5B7A8C]">Tu cuenta ya está activa. Esto es lo que sigue:</p>
      </div>

      {VIDEO && (
        <div className="overflow-hidden rounded-2xl border border-[#D0E4EC] bg-black shadow-md">
          <video controls playsInline preload="none" poster={POSTER || undefined} className="aspect-video w-full">
            <source src={VIDEO} />
          </video>
        </div>
      )}

      <ul className="space-y-2.5 text-left">
        {proximos.map(({ Icono, t, d }, i) => (
          <li key={t} style={{ "--d": `${0.5 + i * 0.12}s` }} className="reg-subir flex items-start gap-3 rounded-xl border border-[#E3EEF3] bg-[#F7F9FB] p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1b3f7a]/10 text-[#1b3f7a]"><Icono size={18} /></span>
            <span><span className="block text-[14px] font-extrabold text-[#1b3f7a]">{t}</span><span className="text-[13px] text-[#5B7A8C]">{d}</span></span>
          </li>
        ))}
      </ul>

      <Boton type="button" onClick={entrar}>Entrar a mi cuenta <ArrowRight size={18} /></Boton>
    </div>
  );
}

// ── Orquestador ───────────────────────────────────────────────────────────────

export default function RegistroClient() {
  const router = useRouter();
  const params = useSearchParams();
  const sourceRef = params.get("sourceRef") || params.get("sref") || params.get("ref") || "";

  const [f, setF] = useState(VACIO);
  const [e, setE] = useState({});
  const [pantalla, setPantalla] = useState("a");
  const [sentido, setSentido] = useState("adelante");
  const [enviando, setEnviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [creada, setCreada] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState("");
  const [yaExiste, setYaExiste] = useState(false);
  const [errorCodigo, setErrorCodigo] = useState("");
  const [aviso, setAviso] = useState("");
  const [espera, setEspera] = useState(0);
  const [reintento, setReintento] = useState("");
  const [mostrarCreando, setMostrarCreando] = useState(false);
  const [listoParaGuardar, setListoParaGuardar] = useState(false);
  const tarjeta = useRef(null);

  // Recuperar lo que ya se había llenado si cerró la pestaña
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(GUARDADO) || "null");
      if (g?.f) {
        setF({ ...VACIO, ...g.f, sitio: "" });
        if (g.pantalla === "b" || g.pantalla === "codigo") setPantalla("b");
      }
    } catch {}
    setListoParaGuardar(true);
  }, []);
  useEffect(() => {
    if (!listoParaGuardar) return;
    try {
      if (pantalla === "agenda" || pantalla === "listo") localStorage.removeItem(GUARDADO);
      else localStorage.setItem(GUARDADO, JSON.stringify({ f: { ...f, sitio: "" }, pantalla }));
    } catch {}
  }, [f, pantalla, listoParaGuardar]);

  // El aviso "Creando tu cuenta" solo sale si la respuesta tarda: con un código mal puesto contesta al instante
  useEffect(() => {
    if (!verificando) { setMostrarCreando(false); return; }
    const t = setTimeout(() => setMostrarCreando(true), 700);
    return () => clearTimeout(t);
  }, [verificando]);

  // Cuenta regresiva para reenviar el código
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const ir = (destino, dir = "adelante") => {
    setSentido(dir);
    setPantalla(destino);
    tarjeta.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const poner = (campo) => (ev) => {
    const valor = ev.target.value;
    setF((x) => ({ ...x, [campo]: valor }));
    if (e[campo]) setE((x) => { const { [campo]: _quitado, ...resto } = x; return resto; });
  };
  const poner2 = (campo, valor) => {
    setF((x) => ({ ...x, [campo]: valor }));
    setE((x) => { const { [campo]: _quitado, ...resto } = x; return resto; });
  };
  const tocar = (campo) => () => {
    const err = revisar(f, [campo])[campo];
    if (err) setE((x) => ({ ...x, [campo]: err }));
  };

  const continuarA = () => {
    const err = revisar(f, CAMPOS_A);
    setE(err);
    if (Object.keys(err).length === 0) ir("b");
  };

  const camposB = ["profesion", "otraProfesion", "cedula", "pacientes", "redSocial", "estado", "ciudad", "recomienda", "terminos"];
  const enviar = async () => {
    setErrorGeneral(""); setYaExiste(false);
    const err = revisar(f, [...CAMPOS_A, ...camposB]);
    setE(err);
    if (Object.keys(err).length) {
      if (CAMPOS_A.some((c) => err[c])) ir("a", "atras");
      return;
    }
    setEnviando(true);
    const r = await api("enviar", { ...f, sourceRef });
    setEnviando(false);

    if (r.ok) {
      setAviso(""); setErrorCodigo(""); setEspera(r.cooldown ?? 60);
      ir("codigo");
      return;
    }
    if (r.errores) {
      setE(r.errores);
      if (CAMPOS_A.some((c) => r.errores[c])) ir("a", "atras");
    }
    setYaExiste(!!r.yaExiste);
    setErrorGeneral(r.error || "No pudimos enviar el código. Intenta de nuevo.");
  };

  const abrirSesion = async (datos) => {
    Cookies.set("customerId", datos.customer.id, { expires: 365 });
    if (datos.token) {
      Cookies.set("proJwt", datos.token, { expires: 365 });
      await fetch("/api/sesion", { method: "POST", headers: { Authorization: `Bearer ${datos.token}` } }).catch(() => {});
    }
  };

  const terminarCuenta = async (r) => {
    await abrirSesion(r);
    setCreada(true);
    api("completar", { email: f.email });
    setTimeout(() => { setVerificando(false); setCreada(false); ir("agenda"); }, 900);
  };

  const verificar = useCallback(async (code) => {
    setErrorCodigo(""); setAviso(""); setReintento("");
    setVerificando(true);
    const r = await api("verificar", { email: f.email, code });
    if (r.ok && r.cuentaLista) { await terminarCuenta(r); return; }
    setVerificando(false);
    if (r.reintento) setReintento(r.reintento);
    setErrorCodigo(r.error || "No pudimos confirmar el código. Intenta de nuevo.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.email]);

  const reintentar = async () => {
    setErrorCodigo(""); setVerificando(true);
    const r = await api("reintentar", { reintento });
    if (r.ok && r.cuentaLista) { setReintento(""); await terminarCuenta(r); return; }
    setVerificando(false);
    if (r.reintento) setReintento(r.reintento);
    setErrorCodigo(r.error || "Seguimos con un problema. Ya avisamos al equipo.");
  };

  const reenviar = async () => {
    setAviso(""); setErrorCodigo("");
    const r = await api("reenviar", { email: f.email });
    if (r.ok) { setEspera(r.cooldown ?? 60); setAviso("Te mandamos otro código."); }
    else setErrorCodigo(r.error || "No pudimos reenviar el código.");
  };

  const actual = indicePaso(pantalla);
  const entrada = sentido === "adelante" ? "reg-entrar-der" : "reg-entrar-izq";

  return (
    <div className="min-h-screen bg-[#F7F9FB] lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <PanelMarca />
      <div className="flex min-h-screen flex-col">
        <CabeceraMovil />
        <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-6 sm:px-6 lg:items-center lg:py-12">
          <div ref={tarjeta} className="relative w-full max-w-[34rem]">
            <div className="relative rounded-3xl border border-[#E3EEF3] bg-white p-5 shadow-[0_24px_60px_-28px_rgba(13,33,51,0.35)] sm:p-8">
              <Progreso actual={actual} />

              <div key={pantalla} className={entrada}>
                {pantalla === "a" && <PantallaA f={f} e={e} poner={poner} tocar={tocar} continuar={continuarA} />}
                {pantalla === "b" && (
                  <PantallaB f={f} e={e} poner={poner} tocar={tocar} poner2={poner2} volver={() => ir("a", "atras")}
                    enviar={enviar} enviando={enviando} errorGeneral={errorGeneral} yaExiste={yaExiste} />
                )}
                {pantalla === "codigo" && (
                  <PantallaCodigo email={f.email.trim()} volver={() => ir("b", "atras")} verificar={verificar} verificando={verificando}
                    error={errorCodigo} reenviar={reenviar} espera={espera} aviso={aviso} reintento={reintento} reintentar={reintentar} />
                )}
                {pantalla === "agenda" && <PantallaAgenda nombre={f.nombre.trim()} siguiente={() => ir("listo")} />}
                {pantalla === "listo" && <PantallaListo nombre={f.nombre.trim()} entrar={() => router.push("/mi-tienda")} />}
              </div>

              {mostrarCreando && pantalla === "codigo" && <CreandoCuenta terminado={creada} />}
            </div>

            {(pantalla === "a" || pantalla === "b") && (
              <p className="mt-5 text-center text-[13px] text-[#5B7A8C]">
                ¿Ya tienes cuenta?{" "}
                <Link href="/wallet" className="font-extrabold text-[#1b3f7a] underline-offset-4 hover:underline">Entra aquí</Link>
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
