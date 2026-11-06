# Correos de protocolo desde VitaPulse

Pro (pro.vitahub.mx) ya no arma ni envía estos correos cuando está prendido el interruptor. Manda un
evento a VitaPulse y **VitaPulse arma el correo con la plantilla nueva, lo envía por Resend (misma
cuenta que Pro, el dominio `pro.vitahub.mx` ya está verificado) y lleva aperturas y clics**.

Pro decide a quién y qué se manda (el candado de una sola vez por orden, la porción de cada producto,
el modo de uso, el referido). VitaPulse solo pinta y envía.

## Ruta que hay que crear en VitaPulse

`POST /api/correos/evento`

- **Autenticación:** header `x-api-key` igual a una variable de VitaPulse (por ejemplo `PRO_EVENTOS_API_KEY`).
  Si no coincide, responder 401.
- **Duplicados:** `evento_id` es único. Si ya se recibió, responder **409** (Pro lo toma como éxito). Guardar
  el `evento_id` con restricción única para que un reintento nunca mande dos correos.
- **Respuestas que Pro entiende:** 2xx o 409 = recibido. 4xx (excepto 429) = datos inválidos, no se reintenta.
  5xx, 429 o sin respuesta en 10 s = Pro libera la orden para reintentar. **No hay respaldo por Resend en Pro**:
  si VitaPulse no envía, ese cliente no recibe el correo hasta que se reintente.
- **Responder rápido** (menos de 10 s). Conviene guardar el evento, responder 2xx y enviar el correo enseguida o
  en segundo plano; lo importante es no perder el evento.

## Datos que llegan (versión 1)

```json
{
  "version": 1,
  "evento_id": "guia_pedido:6012345678901",
  "tipo": "guia_pedido",
  "asunto": "Cómo tomar tu pedido — Vitahub",
  "cliente": { "nombre": "Ana", "email": "ana@ejemplo.com", "email_app": "ana@ejemplo.com" },
  "especialista": { "nombre": "Dra. Laura Pérez", "rol": "contacto" },
  "orden": { "numero": 18131, "fecha_iso": "2026-11-06T01:10:24.000Z", "fecha_texto": "5 de noviembre de 2026" },
  "pdf_url": null,
  "app": {
    "ios_url": "https://apps.apple.com/mx/app/id6821184197",
    "android_url": "https://play.google.com/store/apps/details?id=mx.vitahub.cliente"
  },
  "items": [
    {
      "titulo": "Vitamina B3 | Multigenics Intensive Care Formula | 120 Tabletas",
      "foto": "https://cdn.shopify.com/s/files/…jpg?width=240&height=240&crop=center&format=jpg",
      "cantidad": 2,
      "etiqueta": "Porción: 1 tableta · 2 frascos",
      "instruccion": "Porción: 1 tableta",
      "dosis_cantidad": null,
      "dosis_unidad": null,
      "momentos": [],
      "acompanamiento": null,
      "modo_de_uso": "Tomar 1 tableta al día con alimentos…",
      "nota": null,
      "descripcion": null
    }
  ]
}
```

### Tipos de evento

| `tipo` | Cuándo | `especialista.rol` | `pdf_url` | Orden |
|---|---|---|---|---|
| `protocolo` | Compra con protocolo armado por un profesional | `autor` | sí | número de orden |
| `consultorio` | Venta en el consultorio o en efectivo | `autor` | sí | `numero: null` |
| `guia_pedido` | Compra normal, sin protocolo | `contacto` o sin especialista | `null` | número de orden |

- **`rol: "autor"`**: el profesional diseñó el protocolo. Se puede decir "Protocolo de … por …".
- **`rol: "contacto"`**: el profesional **no** recetó ese pedido; solo es la persona a quien el cliente puede
  escribir si tiene dudas. No decir que lo diseñó ni lo recetó.
- **`especialista: null`**: no mostrar ese bloque. En `guia_pedido` conviene una nota general:
  "Esta guía se armó con la información de los productos de tu pedido y es de carácter general. Ante cualquier
  duda, consulta a un profesional de la salud."
- **`pdf_url: null`**: no mostrar el botón de PDF.
- **`app.android_url: null`**: la app de Android no está habilitada; mostrar solo el botón de iPhone.
- **`orden.numero: null`**: no mostrar "Orden #…". Usar solo la fecha.
- **`cliente.email_app`**: el correo con el que debe entrar a la app para ver sus suplementos.

### Cada producto (`items`)

- `etiqueta`: el texto final de la pastilla, tal como la mostraba el correo anterior. Es lo más simple de usar:
  "Porción: 1 tableta · 2 frascos", "Tomar 2 cápsulas con el desayuno y la cena.", o "×2" si no hay indicación.
- `instruccion`: lo que escribió el profesional (o "Porción: …" en la guía). Puede ser `null`.
- `modo_de_uso`: texto del catálogo. En protocolo solo viene cuando el profesional no indicó cómo tomarlo.
  Si es `null`, no mostrar esa línea.
- `momentos`, `acompanamiento`, `nota`: lo que marcó el profesional. Pueden venir vacíos.
- `foto`: URL de Shopify ya recortada a 240×240. Puede ser `null`: mostrar un recuadro vacío.
- `cantidad`: frascos comprados.

## Seguimiento

Los eventos de apertura y clic llegan por el webhook de Resend (`email.opened`, `email.clicked`). Se
recomienda guardar un registro por correo enviado ligado al cliente (para la ficha del CRM) con `evento_id`,
`tipo`, fecha de envío, `resend_id` y contadores de apertura y clic.

## Variables de entorno

En **Pro** (Vercel): `CORREOS_VIA_VITAPULSE` (`1` para los tres tipos, o una lista como `guia_pedido`; vacío o
`0` = Pro sigue enviando por Resend como antes), `VITAPULSE_URL` (la URL base, sin `/` al final) y
`VITAPULSE_API_KEY` (la misma clave que valida VitaPulse).

En **VitaPulse**: la clave compartida y su `RESEND_API_KEY` (la misma cuenta que Pro).

## Esqueleto de la ruta (Next.js, App Router)

```js
// app/api/correos/evento/route.js
import { NextResponse } from "next/server";

export async function POST(req) {
  if (req.headers.get("x-api-key") !== process.env.PRO_EVENTOS_API_KEY) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const evento = await req.json();
  if (evento.version !== 1 || !evento.evento_id || !evento.cliente?.email || !evento.items?.length) {
    return NextResponse.json({ error: "evento inválido" }, { status: 400 });
  }

  // 1) Guardar el evento con evento_id único. Si ya existe → 409 (Pro lo da por recibido).
  // 2) Armar el HTML con la plantilla nueva a partir de `evento`.
  // 3) Enviar con Resend (from: "Vitahub <noreply@pro.vitahub.mx>", subject: evento.asunto,
  //    tags: [{ name: "evento_id", value: evento.evento_id }]) y guardar el id que devuelve.
  // 4) Responder 200.
  return NextResponse.json({ ok: true });
}
```
