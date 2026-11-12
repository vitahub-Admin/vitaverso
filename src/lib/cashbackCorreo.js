// Correo del cashback (src/lib/cashback.js). Mismo diseño que el correo del protocolo
// (src/lib/protocoloCorreo.js): cabecera azul, banda teal, tarjeta blanca y pie gris.
//
// NO lleva el código del cupón a propósito: se ve y se aplica en la app, así el correo es el
// motivo para descargarla.

const APP_IOS_URL = "https://apps.apple.com/mx/app/id6821184197";
const APP_ANDROID_URL = "https://play.google.com/store/apps/details?id=mx.vitahub.cliente";

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
 * @param conAndroid mostrar el botón de Google Play (solo si la app ya está publicada)
 * @returns {{ asunto, html, texto }}
 */
export function correoCashback({ valor, email, nombre = null, pedido = null, venceIso = null, promo = "Buen Fin", conAndroid = false }) {
  const monto = pesos(valor);
  const saludo = nombre ? `¡Hola, ${escapar(nombre)}!` : "¡Hola!";
  const vence = venceIso ? `Úsalo antes del ${fechaLarga(venceIso)}.` : "";
  const hoy = fechaLarga(new Date().toISOString());

  const boton = (href, texto) =>
    `<a href="${href}" style="display:inline-block;margin:4px;background:#1b3f7a;color:#ffffff;font-size:14px;font-weight:700;padding:13px 24px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">${texto}</a>`;
  const botones = [boton(APP_IOS_URL, "Descargar para iPhone"), conAndroid ? boton(APP_ANDROID_URL, "Descargar para Android") : ""].join("");

  const paso = (n, titulo, detalle) => `
    <tr>
      <td width="34" valign="top" style="width:34px;padding:0 0 18px;">
        <div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:#2BB9B8;color:#0D2133;font-size:13px;font-weight:800;text-align:center;">${n}</div>
      </td>
      <td valign="top" style="padding:2px 0 18px 8px;">
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
<title>Tu cashback de ${monto}</title>
</head>
<body style="margin:0;padding:0;background:#F7F9FB;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">Tienes ${monto} para tu próximo pedido. Lo encuentras en la app Mi Vitahub.</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FB;">
<tr><td align="center" style="padding:40px 20px;">
<table cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

<tr><td style="background:#1b3f7a;border-radius:16px 16px 0 0;padding:30px 40px 26px;">
  <p style="margin:0 0 8px;color:#7eb8c9;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">Cashback ${escapar(promo)}</p>
  <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.2;">Tienes ${monto} para tu próxima compra</h1>
</td></tr>

<tr><td style="background:#2BB9B8;padding:18px 40px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td>
      <p style="margin:0;color:rgba(13,33,51,0.7);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">Para</p>
      <p style="margin:4px 0 0;color:#0D2133;font-size:15px;font-weight:700;">${escapar(nombre || email)}</p>
    </td>
    <td align="right">
      <p style="margin:0;color:rgba(13,33,51,0.7);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;text-align:right;">Cashback</p>
      <p style="margin:4px 0 0;color:#0D2133;font-size:15px;font-weight:700;text-align:right;">${monto} MXN</p>
    </td>
  </tr>
  </table>
</td></tr>

<tr><td style="background:#ffffff;padding:12px 40px;border-bottom:1px solid #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${filaPedido}</tr></table>
</td></tr>

<tr><td style="background:#ffffff;padding:30px 40px 10px;">
  <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1b3f7a;">${saludo}</p>
  <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.7;">Gracias por tu compra. Te regalamos cashback para que lo uses en tu próximo pedido.</p>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr><td align="center" style="background:#EAF8F8;border:1px solid #B5E7E6;border-radius:14px;padding:26px 20px;">
    <p style="margin:0;font-size:10px;font-weight:700;color:#1F8383;letter-spacing:2px;text-transform:uppercase;">Tu cashback</p>
    <p style="margin:6px 0 0;font-size:44px;font-weight:800;color:#1b3f7a;line-height:1;">${monto}</p>
    <p style="margin:8px 0 0;font-size:13px;color:#4b5563;">Ya está en tu cuenta de la app Mi Vitahub${vence ? `<br>${vence}` : ""}</p>
  </td></tr>
  </table>

  <p style="margin:0 0 18px;font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;">Cómo usarlo</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    ${paso(1, "Descarga la app Mi Vitahub", "Gratis para iPhone" + (conAndroid ? " y Android." : "."))}
    ${paso(2, "Entra con este correo", `Usa <strong style="color:#1b3f7a;">${escapar(email)}</strong>: tu cashback está guardado ahí.`)}
    ${paso(3, "Úsalo en tu próximo pedido", "Arma tu carrito en la app y elige tu cashback en <strong>Tus descuentos</strong> antes de pagar.")}
  </table>
</td></tr>

<tr><td style="background:#EAF8F8;border-top:1px solid #B5E7E6;padding:26px 40px;text-align:center;">
  <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1b3f7a;">Descarga Mi Vitahub</p>
  <p style="margin:0 0 14px;font-size:13px;color:#4b5563;line-height:1.6;">Además de tu cashback: recordatorios para cada toma y un aviso antes de que se te termine un suplemento.</p>
  ${botones}
</td></tr>

<tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;border-radius:0 0 16px 16px;padding:24px 40px;">
  <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.8;text-align:center;">
    Cashback de un solo uso, se combina con otras promociones.<br>No es canjeable por dinero.<br><br>
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

  return { asunto: `Tienes ${monto} de cashback esperándote 🎁`, html, texto };
}
