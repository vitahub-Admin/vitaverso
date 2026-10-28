# API de inventario de consignación (solo lectura)

Para sistemas externos que necesitan saber qué producto se mueve y se vende en los consultorios,
sobre todo las ventas que **no pasan por Shopify** (venta de consultorio con tarjeta y efectivo liquidado).

- Base: `https://pro.vitahub.mx/api/v1/inventario`
- Autenticación: la misma llave que las demás APIs externas, en el encabezado `x-api-key: <llave>`
  (variable de Vercel `SHARECART_API_KEY`). También vale `Authorization: Bearer <llave>`.
  Si se quiere una llave aparte para un consumidor, va en `INVENTARIO_API_KEYS` (varias separadas por coma).
- Todo es lectura. Las fechas son ISO 8601 en UTC.

## GET /movimientos

Movimientos en orden cronológico, para leerlos por tandas.

| Parámetro  | Descripción |
|------------|-------------|
| `cursor`   | El `siguiente_cursor` de la respuesta anterior. Tiene prioridad sobre `desde`. |
| `desde`    | Fecha ISO; solo se usa sin cursor. Por defecto, desde el principio. |
| `tipo`     | `entrega`, `venta`, `devolucion`, `ajuste` (varios separados por coma). |
| `owner_id` | ID Shopify del profesional. |
| `limite`   | 1–500 (por defecto 200). |

Respuesta:

```json
{
  "ok": true,
  "hay_mas": true,
  "siguiente_cursor": "…",
  "movimientos": [{
    "id": "uuid",
    "ocurrido_en": "2026-10-27T13:35:43Z",
    "tipo": "venta",
    "cantidad": 1,
    "efecto_consultorio": -1,
    "motivo": "Venta en consultorio · …",
    "producto":    { "variant_id": 0, "product_id": 0, "sku": "VHMX00034", "titulo": "…", "variante": "90 cápsulas" },
    "profesional": { "id": 0, "nombre": "…" },
    "venta":       { "id": "uuid", "estado": "pagado", "pagada_en": "…", "pasarela": "stripe",
                     "precio_unitario": 515.12, "importe": 515.12 }
  }]
}
```

Cómo leerla:

1. Primera vez: sin cursor (o con `desde`). Mientras `hay_mas` sea `true`, repetir con el `siguiente_cursor`.
2. Guardar el último `siguiente_cursor`. Las consultas siguientes con ese cursor traen solo lo nuevo.
   Con `hay_mas: false`, el cursor sigue sirviendo después: devuelve lo que ocurra más adelante.
3. `id` es único; úsalo para no duplicar si reintentas.

`tipo` y `efecto_consultorio` (cuánto cambia lo que hay en el consultorio del profesional):

| tipo         | efecto_consultorio | significado |
|--------------|--------------------|-------------|
| `entrega`    | `+cantidad`        | Vitahub deja producto en el consultorio. |
| `venta`      | `−cantidad`        | Se vendió al paciente. Trae `venta` con precio e importe. |
| `devolucion` | `−cantidad`        | El profesional regresa producto a Vitahub. |
| `ajuste`     | `cantidad` (± )    | Conteos, mermas, o regreso al cancelar una venta. |

Las ventas en efectivo generan su movimiento `venta` **al liquidar** (cuando el profesional paga su
carrito), no al cobrar al paciente. Las cuentas de prueba no generan movimientos.

## GET /consultorios

Foto del stock en consignación, por profesional y producto: `entregado`, `vendido`, `devuelto`,
`ajuste`, `disponible`, y `reservado` (efectivo cobrado y aún sin liquidar; sigue contando dentro de
`disponible` del libro hasta que se paga).

Parámetros: `owner_id`, `con_stock=1` (solo filas con `disponible > 0`).
