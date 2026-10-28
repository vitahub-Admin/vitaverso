import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { armarProtocolo, etiquetaDeProducto, escaparHtml } from "@/lib/protocoloDatos";

// Correo del protocolo de suplementación que recibe el paciente. Mismo diseño y mismos datos que el
// PDF (src/app/api/protocolo-pdf/route.js): si se cambia uno, se cambia el otro. Los datos salen de
// armarProtocolo (src/lib/protocoloDatos.js).

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// App de pacientes. Android se muestra recién cuando esté publicada en Google Play
// (MI_VITAHUB_ANDROID_PUBLICA=1 en Vercel): antes de eso el link da 404.
const APP_IOS_URL = "https://apps.apple.com/mx/app/id6821184197";
const APP_ANDROID_URL = "https://play.google.com/store/apps/details?id=mx.vitahub.cliente";

// Bloque "Sigue tu protocolo en Mi Vitahub". appEmail: el correo con el que debe entrar
// para que la app encuentre su compra (se busca por ese correo).
function bloqueApp(appEmail) {
  const boton = (href, texto) =>
    `<a href="${href}" style="display:inline-block;margin:4px;background:#ffffff;color:#1b3f7a;border:1px solid #B5E7E6;font-size:13px;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;">${texto}</a>`;
  const botones = [
    boton(APP_IOS_URL, "Descargar para iPhone"),
    process.env.MI_VITAHUB_ANDROID_PUBLICA === "1" ? boton(APP_ANDROID_URL, "Descargar para Android") : "",
  ].join("");
  return `
<tr><td style="background:#EAF8F8;border-top:1px solid #B5E7E6;padding:24px 40px;text-align:center;">
  <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1b3f7a;">Sigue tu protocolo en la app Mi Vitahub</p>
  <p style="margin:0 0 14px;font-size:13px;color:#4b5563;line-height:1.6;">Recordatorios para cada toma y un aviso antes de que se te termine un suplemento.<br>Entra con <strong style="color:#1b3f7a;">${escaparHtml(appEmail)}</strong> y verás tus suplementos.</p>
  ${botones}
</td></tr>`;
}

export function buildPrescriptionEmail({ affiliateName, patientName, orderNumber, date, lineItems, shareCartToken, appEmail = null }) {
  const pdfUrl = `https://pro.vitahub.mx/api/protocolo-pdf?token=${shareCartToken}`;
  const paciente = escaparHtml(patientName);
  const especialista = escaparHtml(affiliateName);

  const rows = lineItems.map((item, i) => {
    const etiqueta = etiquetaDeProducto(item);
    const pill = etiqueta.tipo === "dosis"
      ? `<span style="display:inline-block;background:#2BB9B8;color:#0D2133;font-size:11px;font-weight:700;padding:4px 11px;border-radius:20px;">${escaparHtml(etiqueta.texto)}</span>`
      : `<span style="display:inline-block;background:#1b3f7a;color:#ffffff;font-size:11px;font-weight:700;padding:4px 11px;border-radius:20px;">${escaparHtml(etiqueta.texto)}</span>`;

    const foto = item.foto
      ? `<img src="${item.foto}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;border-radius:12px;border:1px solid #D0E4EC;object-fit:cover;background:#F7F9FB;">`
      : `<div style="width:72px;height:72px;border-radius:12px;border:1px solid #D0E4EC;background:#F7F9FB;"></div>`;

    // Si el profesional no indicó cómo se toma, va el modo de uso del producto
    const usoRow = item.modo_de_uso
      ? `<p style="margin:8px 0 0;font-size:12px;color:#1b3f7a;line-height:1.6;"><strong>Modo de uso:</strong> ${escaparHtml(item.modo_de_uso)}</p>`
      : "";
    const notaRow = item.nota
      ? `<p style="margin:6px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">Nota: ${escaparHtml(item.nota)}</p>`
      : "";

    return `
    <tr>
      <td style="padding-bottom:22px;${i > 0 ? "padding-top:22px;border-top:1px solid #f3f4f6;" : ""}">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="72" valign="top" style="width:72px;">${foto}</td>
            <td valign="top" style="padding-left:16px;">
              ${pill}
              <p style="margin:8px 0 0;font-size:15px;font-weight:700;color:#1b3f7a;line-height:1.35;">${escaparHtml(item.title)}</p>
              <p style="margin:6px 0 0;font-size:13px;color:#6b7280;line-height:1.65;">${item.desc}</p>
              ${usoRow}
              ${notaRow}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join("");

  const filaOrden = orderNumber
    ? `<td style="color:#9ca3af;font-size:12px;">Orden #${orderNumber}</td><td align="right" style="color:#9ca3af;font-size:12px;">${date}</td>`
    : `<td align="right" style="color:#9ca3af;font-size:12px;">${date}</td>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Protocolo de Suplementación</title>
</head>
<body style="margin:0;padding:0;background:#F7F9FB;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FB;">
<tr><td align="center" style="padding:40px 20px;">
<table cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

<tr><td style="background:#1b3f7a;border-radius:16px 16px 0 0;padding:30px 40px 26px;">
  <p style="margin:0 0 8px;color:#7eb8c9;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">Vitahub Pro</p>
  <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.2;">Protocolo de Suplementación</h1>
</td></tr>

<tr><td style="background:#2BB9B8;padding:18px 40px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td>
      <p style="margin:0;color:rgba(13,33,51,0.7);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">Paciente</p>
      <p style="margin:4px 0 0;color:#0D2133;font-size:15px;font-weight:700;">${paciente}</p>
    </td>
    <td align="right">
      <p style="margin:0;color:rgba(13,33,51,0.7);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;text-align:right;">Especialista</p>
      <p style="margin:4px 0 0;color:#0D2133;font-size:15px;font-weight:700;text-align:right;">${especialista}</p>
    </td>
  </tr>
  </table>
</td></tr>

<tr><td style="background:#ffffff;padding:12px 40px;border-bottom:1px solid #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>${filaOrden}</tr>
  </table>
</td></tr>

<tr><td style="background:#ffffff;padding:28px 40px;">
  <p style="margin:0 0 20px;font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;">Tu protocolo incluye</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
  ${rows}
  </table>
</td></tr>

<tr><td style="background:#f0f7ff;border-top:1px solid #dbeafe;padding:24px 40px;text-align:center;">
  <p style="margin:0 0 16px;font-size:13px;color:#4b5563;">Guarda tu protocolo para consultarlo cuando quieras</p>
  <a href="${pdfUrl}" style="display:inline-block;background:#1b3f7a;color:#ffffff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
    Descargar mi protocolo en PDF
  </a>
</td></tr>
${appEmail ? bloqueApp(appEmail) : ""}

<tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;border-radius:0 0 16px 16px;padding:24px 40px;">
  <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.8;text-align:center;">
    Este protocolo fue diseñado para ti por <strong style="color:#6b7280;">${especialista}</strong><br>a través de <strong style="color:#1b3f7a;">Vitahub Pro</strong>.<br>
    Para dudas o ajustes, contacta directamente a tu especialista.<br><br>
    <a href="https://vitahub.mx" style="color:#1F8383;text-decoration:none;font-weight:600;">vitahub.mx</a>
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Envía el protocolo de una venta en efectivo al correo que se capturó al cobrar. Lo manda quien
 * cierra la liquidación, cuando el profesional paga su carrito.
 *
 * @param venta fila de ventas_efectivo (patient_email, sharecart_token, patient_name, owner_id, created_at)
 */
export async function enviarProtocoloDeVentaEfectivo(venta) {
  if (!venta?.patient_email || !venta?.sharecart_token) return { ok: false, motivo: "sin correo o sin protocolo" };

  const { data: cart } = await supabase
    .from("sharecarts")
    .select("owner_id, name, extra, items")
    .eq("token", venta.sharecart_token)
    .maybeSingle();
  if (!cart) return { ok: false, motivo: "el protocolo ya no existe" };

  const { data: afiliado } = await supabase
    .from("affiliates")
    .select("first_name, last_name")
    .eq("shopify_customer_id", Number(venta.owner_id))
    .maybeSingle();

  const lineItems = await armarProtocolo({
    items: cart.items?.length ? cart.items : (venta.items || []).map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
    dosisMap: cart.extra?.dosis_map || {},
    titulos: Object.fromEntries((venta.items || []).map((i) => [i.variant_id, i.title || ""])),
  });
  if (!lineItems.length) return { ok: false, motivo: "el protocolo no tiene productos" };

  const html = buildPrescriptionEmail({
    affiliateName: [afiliado?.first_name, afiliado?.last_name].filter(Boolean).join(" ") || "Tu especialista en Vitahub",
    patientName:   venta.patient_name || cart.name || "Paciente",
    orderNumber:   null,   // una venta local no tiene número de orden de Shopify
    date: new Date(venta.created_at || Date.now()).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" }),
    lineItems,
    shareCartToken: venta.sharecart_token,
    // La app encuentra esta compra por el correo: tiene que entrar con este mismo
    appEmail:       venta.patient_email,
  });

  const { error } = await resend.emails.send({
    from: "Vitahub Pro <noreply@pro.vitahub.mx>",
    to: venta.patient_email,
    subject: "Tu protocolo de suplementación — Vitahub Pro",
    html,
    tags: [{ name: "flujo", value: "protocolo_efectivo" }],
  });
  if (error) return { ok: false, motivo: error.message || JSON.stringify(error) };
  return { ok: true };
}
