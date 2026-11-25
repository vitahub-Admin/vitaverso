// Link único para descargar una app: manda a la tienda que corresponde al celular.
//   /app      → Mi Vitahub (clientes)
//   /app-pro  → Vitahub Pro (profesionales)
// En computadora (o si no se reconoce el aparato) muestra una página con los dos botones.
// `?origen=banner` se pasa a las tiendas como campaña (App Store `ct`, Play `referrer`)
// para poder ver desde dónde llegan las descargas.

const APPS = {
  cliente: {
    nombre: "Mi Vitahub",
    ios: "https://apps.apple.com/mx/app/mi-vitahub/id6821184197",
    android: "https://play.google.com/store/apps/details?id=mx.vitahub.cliente",
  },
  pro: {
    nombre: "Vitahub Pro",
    ios: "https://apps.apple.com/us/app/vitahub-pro/id6779682915",
    android: "https://play.google.com/store/apps/details?id=mx.vitahub.afiliados",
  },
};

const ORIGEN_VALIDO = /^[a-z0-9_-]{1,40}$/i;

function conOrigen(url, plataforma, origen) {
  if (!origen) return url;
  const u = new URL(url);
  if (plataforma === "ios") u.searchParams.set("ct", origen);
  else u.searchParams.set("referrer", `utm_source=${origen}`);
  return u.toString();
}

function plataformaDe(userAgent) {
  const ua = userAgent || "";
  // iPadOS 13+ se identifica como Mac, pero con pantalla táctil; el resto cae en la página
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return null;
}

function paginaDeDescarga(app, origen) {
  const ios = conOrigen(app.ios, "ios", origen);
  const android = conOrigen(app.android, "android", origen);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Descarga ${app.nombre}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6fbfb;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#12343a}
main{max-width:360px;padding:32px 24px;text-align:center}
h1{font-size:22px;margin:0 0 8px}p{margin:0 0 24px;color:#4a6b70}
a{display:block;margin:10px 0;padding:14px;border-radius:12px;background:#2BB9B8;color:#fff;font-weight:700;text-decoration:none}
</style></head><body><main>
<h1>Descarga ${app.nombre}</h1><p>Elige tu tienda de aplicaciones.</p>
<a href="${ios}">App Store (iPhone)</a><a href="${android}">Google Play (Android)</a>
</main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export function responderDescarga(req, clave) {
  const app = APPS[clave];
  const origenCrudo = new URL(req.url).searchParams.get("origen");
  const origen = origenCrudo && ORIGEN_VALIDO.test(origenCrudo) ? origenCrudo : null;
  const plataforma = plataformaDe(req.headers.get("user-agent"));

  // Queda en los logs de Vercel: cuántos toques y desde dónde
  console.log(`descarga-app app=${clave} plataforma=${plataforma ?? "otra"} origen=${origen ?? "-"}`);

  if (!plataforma) return paginaDeDescarga(app, origen);
  return new Response(null, {
    status: 302,
    headers: { location: conOrigen(app[plataforma], plataforma, origen), "cache-control": "no-store" },
  });
}
