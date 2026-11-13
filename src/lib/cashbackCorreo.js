// Correo del cashback (src/lib/cashback.js). Mismo lenguaje visual que el PDF del protocolo
// (src/app/api/protocolo-pdf/route.js): cabecera azul, banda turquesa, la banda "Descarga Mi
// Vitahub" con el teléfono y los badges oficiales de App Store y Google Play.
//
// Las imágenes viven en public/correo/ (servidas desde pro.vitahub.mx/correo/…); son las mismas
// del PDF (src/lib/protocoloPdfImagenes.js). Para una prueba antes de publicarlas se pueden pasar
// como `cid:` (adjuntos en línea de Resend).
//
// NO lleva el código del cupón a propósito: se ve y se aplica en la app, así el correo es el
// motivo para descargarla.

const APP_IOS_URL = "https://apps.apple.com/mx/app/mi-vitahub/id6821184197";
const APP_ANDROID_URL = "https://play.google.com/store/apps/details?id=mx.vitahub.cliente";

const BASE_IMG = "https://pro.vitahub.mx/correo";
export const IMAGENES_CORREO = {
  banda: `${BASE_IMG}/banda-app.jpg`,
  appStore: `${BASE_IMG}/badge-appstore.png`,
  googlePlay: `${BASE_IMG}/badge-googleplay.png`,
};

const escapar = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pesos = (n) => `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
const fechaLarga = (iso) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });

/**
 * @param valor      monto del cashback en pesos
 * @param email      correo con el que tiene que entrar a la app (ahí está el cupón)
 * @param nombre     nombre del cliente, o null
 * @param pedido     número de la compra que lo generó ("#ORDVHMX1234"), o null
 * @param venceIso   fecha de fin del cupón, o null si no vence
 * @param promo      texto de la promo ("Buen Fin")
 * @param conAndroid mostrar el badge de Google Play (la app ya está publicada: por defecto sí)
 * @param imagenes   URLs de las imágenes (por defecto, las publicadas en pro.vitahub.mx)
 * @param recordatorio  true: el segundo correo, para quien todavía no descargó la app
 * @returns {{ asunto, html, texto }}
 */
export function correoCashback({ valor, email, nombre = null, pedido = null, venceIso = null, promo = "Buen Fin", conAndroid = true, imagenes = IMAGENES_CORREO, recordatorio = false }) {
  const monto = pesos(valor);
  const saludo = nombre ? `¡Hola, ${escapar(nombre)}!` : "¡Hola!";
  const titulo = recordatorio ? `Tus ${monto} de cashback siguen esperándote` : `Tienes ${monto} para tu próxima compra`;
  const intro = recordatorio
    ? `Te recordamos que tienes <strong style="color:#1b3f7a;">${monto} de cashback</strong> por tu compra del Buen Fin. Para usarlo solo tienes que descargar la app <strong style="color:#1b3f7a;">Mi Vitahub</strong>, disponible para iPhone y Android, y entrar con tu correo.`
    : `Gracias por tu compra. Te regalamos cashback para tu próximo pedido: ya está guardado en tu cuenta de la app <strong style="color:#1b3f7a;">Mi Vitahub</strong>.`;
  const disponible = conAndroid ? "Disponible para iPhone y Android" : "Disponible para iPhone";
  const vence = venceIso ? `Úsalo antes del ${fechaLarga(venceIso)}.` : "";
  const hoy = fechaLarga(new Date().toISOString());

  const badges = [
    `<a href="${APP_IOS_URL}" style="display:inline-block;margin:0 6px;"><img src="${imagenes.appStore}" width="135" height="45" alt="Descargar en App Store" style="display:block;width:135px;height:45px;border:0;"></a>`,
    conAndroid
      ? `<a href="${APP_ANDROID_URL}" style="display:inline-block;margin:0 6px;"><img src="${imagenes.googlePlay}" width="151" height="45" alt="Descargar en Google Play" style="display:block;width:151px;height:45px;border:0;"></a>`
      : "",
  ].join("");

  const paso = (n, titulo, detalle) => `
    <tr>
      <td width="40" valign="top" style="width:40px;padding:0 0 16px;">
        <div style="width:28px;height:28px;line-height:28px;border-radius:14px;background:#2BB9B8;color:#0D2133;font-size:13px;font-weight:800;text-align:center;">${n}</div>
      </td>
      <td valign="top" style="padding:3px 0 16px 4px;">
        <p style="margin:0;font-size:14px;font-weight:700;color:#1b3f7a;line-height:1.4;">${titulo}</p>
        <p style="margin:3px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">${detalle}</p>
      </td>
    </tr>`;

  const filaPedido = pedido
    ? `<td style="color:#9ca3af;font-size:12px;">Por tu pedido ${escapar(pedido)}</td><td align="right" style="color:#9ca3af;font-size:12px;">${hoy}</td>`
    : `<td align="right" style="color:#9ca3af;font-size:12px;">${hoy}</td>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#F7F9FB;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">Tienes ${monto} para tu próximo pedido. Lo encuentras en la app Mi Vitahub.</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FB;">
<tr><td align="center" style="padding:32px 16px;">
<table cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">

<tr><td style="background:#1b3f7a;padding:30px 40px 26px;">
  <p style="margin:0 0 8px;color:#7eb8c9;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">Cashback ${escapar(promo)}</p>
  <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;line-height:1.2;">${titulo}</h1>
  ${recordatorio ? `<p style="margin:10px 0 0;color:#B5E7E6;font-size:15px;font-weight:700;">📲 App Mi Vitahub · ${conAndroid ? "Disponible en Android y iPhone" : "Disponible en iPhone"}</p>` : ""}
</td></tr>

<tr><td style="background:#2BB9B8;padding:14px 40px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td>
      <p style="margin:0;color:rgba(13,33,51,0.7);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">Para</p>
      <p style="margin:3px 0 0;color:#0D2133;font-size:15px;font-weight:700;">${escapar(nombre || email)}</p>
    </td>
    <td align="right">
      <p style="margin:0;color:rgba(13,33,51,0.7);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;text-align:right;">Cashback</p>
      <p style="margin:3px 0 0;color:#0D2133;font-size:15px;font-weight:700;text-align:right;">${monto} MXN</p>
    </td>
  </tr>
  </table>
</td></tr>

<tr><td style="padding:10px 40px;border-bottom:1px solid #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${filaPedido}</tr></table>
</td></tr>

<tr><td style="padding:28px 40px 6px;">
  <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1b3f7a;">${saludo}</p>
  <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.7;">${intro}</p>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 26px;">
  <tr><td align="center" style="border:2px dashed #2BB9B8;border-radius:14px;padding:22px 20px;background:#F4FBFB;">
    <p style="margin:0;font-size:10px;font-weight:700;color:#1F8383;letter-spacing:2px;text-transform:uppercase;">Tu cashback</p>
    <p style="margin:6px 0 0;font-size:46px;font-weight:800;color:#1b3f7a;line-height:1;">${monto}</p>
    <p style="margin:8px 0 0;font-size:12px;color:#6b7280;">Para tu próximo pedido${vence ? ` · ${vence}` : ""}</p>
  </td></tr>
  </table>

  <p style="margin:0 0 16px;font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;">Cómo usarlo</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    ${paso(1, "Descarga la app Mi Vitahub", `Es gratis. ${disponible}, con los botones de abajo.`)}
    ${paso(2, "Entra con este correo", `Usa <strong style="color:#1b3f7a;">${escapar(email)}</strong>: tu cashback está guardado ahí.`)}
    ${paso(3, "Úsalo en tu próximo pedido", "Arma tu carrito en la app y elige tu cashback en <strong style=\"color:#1b3f7a;\">Tus descuentos</strong> antes de pagar.")}
  </table>
</td></tr>

<tr><td style="padding:10px 0 0;">
  <a href="${APP_IOS_URL}" style="display:block;"><img src="${imagenes.banda}" width="600" alt="Descarga Mi Vitahub y no te pierdas ninguna dosis" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a>
</td></tr>

<tr><td align="center" style="padding:18px 32px 26px;">
  <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1b3f7a;">${disponible}</p>
  <p style="margin:0 0 14px;font-size:13px;color:#4b5563;line-height:1.6;">Entra con <strong style="color:#1b3f7a;">${escapar(email)}</strong> y verás tu cashback y tus suplementos.</p>
  ${badges}
</td></tr>

<tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:22px 40px;">
  <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.8;text-align:center;">
    Cashback de un solo uso. Se combina con otras promociones y no es canjeable por dinero.<br>
    <a href="https://vitahub.mx" style="color:#1F8383;text-decoration:none;font-weight:600;">vitahub.mx</a>
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const texto = [
    `${nombre ? `¡Hola, ${nombre}!` : "¡Hola!"} Gracias por tu compra${pedido ? ` ${pedido}` : ""}.`,
    `Tienes ${monto} de cashback para tu próximo pedido. ${vence}`,
    `1. Descarga la app Mi Vitahub. 2. Entra con ${email}. 3. Elige tu cashback en Tus descuentos antes de pagar.`,
    `iPhone: ${APP_IOS_URL}`,
    conAndroid ? `Android: ${APP_ANDROID_URL}` : "",
  ].filter(Boolean).join("\n");

  return {
    asunto: recordatorio
      ? `Tus ${monto} de cashback te esperan en la app · ${conAndroid ? "Android y iPhone" : "iPhone"} 📲`
      : `Tienes ${monto} de cashback esperándote 🎁`,
    html,
    texto: recordatorio ? `Te recordamos que tienes ${monto} de cashback. Descarga Mi Vitahub (${disponible.toLowerCase()}) y entra con ${email}.\n${texto}` : texto,
  };
}
