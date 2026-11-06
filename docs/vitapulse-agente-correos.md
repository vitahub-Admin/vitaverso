# Correos de protocolo desde VitaPulse — guía para armar todo el proceso

Documento para el agente que construye esto en VitaPulse. VitaPulse ya escucha la base de datos de Pro
(Supabase) y las ventas de Shopify. Con eso puede decidir, armar y enviar estos correos **sin que Pro le
mande nada**. Aquí están las reglas exactas que hoy aplica Pro, para que el resultado sea el mismo.

Lo que se construye: tres correos que hoy salen desde Pro por Resend (`pro.vitahub.mx`) y pasan a salir
desde VitaPulse, con la plantilla nueva y con seguimiento de aperturas y clics.

---

## 0. Reglas que no se pueden saltar

1. **Nunca procesar histórico.** Solo se envía por eventos que ocurran **después de la fecha de corte**
   que se acuerde con Maxi. Si el proceso se programa como "enviar todo lo que no tenga marca de enviado", se
   le mandaría el correo a todas las órdenes históricas que no lo llevaban. Filtrar siempre por fecha (por
   ejemplo `orders.shopify_created_at >= corte`) y escuchar eventos nuevos, no barrer tablas.
2. **Idempotencia propia.** Una tabla propia `correos_enviados` con restricción única `(tipo, ref)`. Antes de
   enviar se inserta la fila; si ya existía, no se envía. No depender de las marcas de Pro
   (`orders.protocol_email_sent_at`, `ventas_efectivo.protocolo_enviado_at`) ni escribir en ellas.
3. **No escribir en las tablas de Pro.** Solo leer. Todo lo que VitaPulse necesite guardar va en sus tablas.
4. **Un solo correo por orden.** Una orden de Shopify produce a lo sumo uno: o `protocolo`, o `guia_pedido`,
   nunca los dos.
5. **Si falta un dato esencial, no enviar** y registrar el motivo (sin correo del cliente, sin productos
   válidos). Es mejor no mandar que mandar un correo roto.
6. **Modo sombra antes del corte.** Hasta el corte, Pro sigue enviando por Resend. Mientras tanto, VitaPulse
   arma cada correo, lo guarda y **no lo envía** (o lo manda solo a un correo de prueba) para comparar contra
   lo que Pro mandó. Con eso se valida que las reglas coinciden. Ver sección 7.

---

## 1. De dónde salen los datos

### Supabase de Pro (solo lectura)

| Tabla | Columnas que importan |
|---|---|
| `orders` | `order_id`, `order_name`, `customer_id`, `customer_name`, `customer_email`, `share_cart` (token del protocolo, o null), `specialist_ref`, `corrected_ref`, `status`, `financial_status`, `line_items`, `shopify_created_at` |
| `sharecarts` | `token`, `owner_id` (el profesional), `name` (nombre del paciente), `items` (`[{ variant_id, quantity }]`), `extra` (con `origen`, `dosis_map`, `order_number`, `order_date`) |
| `affiliates` | `shopify_customer_id`, `first_name`, `last_name`, `email` |
| `ventas_efectivo` | `id`, `patient_email`, `patient_name`, `sharecart_token`, `owner_id`, `items` (`[{ variant_id, title, quantity }]`), `estado`, `liquidacion_id`, `created_at` |
| `local_orders` | `id`, `owner_id`, `sharecart_token`, `patient_name`, `patient_email`, `items`, `estado`, `payment_id` (`shopify_<id de la orden>`), `paid_at` |
| `liquidaciones_efectivo` | `local_order_id` (liga con `local_orders.id`) |
| `product_catalog` | `variant_id`, `product_id`, `sku`, `title`, `componente`, `modo_de_uso` |
| `componentes` | `slug`, `descripcion` |

Nota: `orders.line_items` **no trae `variant_id`**. Para la porción hace falta el `variant_id`: tomarlo de
la orden de Shopify (que sí lo trae) o buscarlo por `sku` en `product_catalog`.

### Shopify (Admin API)
- La orden completa (`line_items` con `variant_id`, `product_id`, `quantity`, `title`).
- Metafields de la variante: `custom.tipo_dosis` (texto), `custom.dosis` (entero).
- Foto del producto: `featuredImage.url` del producto.

### Atribución (el profesional de la compra)
La resuelve Pro al recibir la orden y la deja en `orders.corrected_ref` (o `orders.specialist_ref` si no se
corrigió). `"0000"` o vacío significa **sin profesional**. **Disparar desde la tabla `orders`** (inserción o
actualización con `financial_status = 'paid'`) y no desde el evento crudo de Shopify: Pro escribe la fila
justo después de resolver la atribución, y si se actúa antes se pierde el referido.

---

## 2. Los tres correos

Todos salen de **la misma cuenta de Resend que Pro** (el dominio `pro.vitahub.mx` ya está verificado).

| | `protocolo` | `consultorio` | `guia_pedido` |
|---|---|---|---|
| Qué es | Compra con protocolo armado por un profesional | Venta en el consultorio o en efectivo | Compra normal de la tienda, sin protocolo |
| De | `Vitahub Pro <noreply@pro.vitahub.mx>` | igual | `Vitahub <noreply@pro.vitahub.mx>` |
| Asunto | Tu protocolo de suplementación — Vitahub Pro | igual | Cómo tomar tu pedido — Vitahub |
| Tag Resend `flujo` | `protocolo` | `protocolo_efectivo` | `guia_pedido` |
| Profesional en el correo | Autor ("Protocolo de … por …") | Autor | Solo contacto para dudas (opcional) |
| Botón PDF | Sí | Sí | No |
| Número de orden | Sí | No (no existe en efectivo) | Sí |

### 2.1 `protocolo`
- **Cuándo:** orden pagada (`financial_status = 'paid'`) con `orders.share_cart` no nulo y
  `sharecarts.extra.origen = 'protocolo'` (donde `sharecarts.token = orders.share_cart`).
- **Destinatario:** `orders.customer_email`.
- **Paciente:** `sharecarts.name`; si falta, nombre y apellido del cliente; si no, "Paciente".
- **Profesional:** `affiliates` donde `shopify_customer_id = sharecarts.owner_id`, nombre y apellido; si no
  existe, "Tu especialista en Vitahub".
- **Productos:** `sharecarts.items` si trae algo; si no, las líneas de la orden.
- **Indicación por producto:** `sharecarts.extra.dosis_map[String(variant_id)]`, que es
  `{ instruccion, dosis_amount, dosis_unit, momentos[], acompanamiento, nota }`.
- **PDF:** `https://pro.vitahub.mx/api/protocolo-pdf?token=<orders.share_cart>`.
- **Ref de idempotencia:** `order_id`.

### 2.2 `consultorio`
Hay dos caminos, los dos con indicación del profesional y botón PDF:
- **Venta en efectivo:** al insertarse una fila en `ventas_efectivo` con `patient_email` y `sharecart_token`
  no nulos (el paciente pagó en mano). Se envía **en ese momento**, sin esperar a la liquidación del
  profesional. Productos: `sharecarts.items` (token = `sharecart_token`) y, si está vacío, `ventas_efectivo.items`.
  Paciente: `patient_name`, o `sharecarts.name`, o "Paciente". Profesional: `affiliates` con
  `shopify_customer_id = owner_id`. **Ref de idempotencia:** `ventas_efectivo.id`.
- **Venta de consultorio cobrada por el checkout de Shopify:** `local_orders.estado = 'pagado'` con
  `sharecart_token` no nulo y `payment_id` que empiece por `shopify_`. **Excluir** las que son el cierre de
  liquidación de ventas en efectivo (existe una fila en `liquidaciones_efectivo` con
  `local_order_id = local_orders.id`): esos pacientes ya recibieron su correo al pagar en mano. Se manda con
  número de orden (el `order_number` de Shopify de `payment_id`). Productos: `sharecarts.items` (token =
  `sharecart_token`) si trae algo; si no, `local_orders.items` (las unidades con `mano_qty > 0` son lo entregado
  en el consultorio y el resto se envía a domicilio; todo se lista). Pro envía este caso con el tag
  `flujo = protocolo`. **Ref de idempotencia:** `local_orders.id`.
- Si una venta en efectivo tiene `liquidacion_id` y el profesional paga su carrito, **no** reenviar.

### 2.3 `guia_pedido`
- **Cuándo:** orden pagada **sin** `share_cart`, que no sea una cita (las órdenes de citas llevan el atributo
  `booking_appointment_id`), con `customer_email`, y que no sea el cierre de una venta de consultorio
  (`payment_id`/`local_orders`, ver 2.2).
- **No enviar si** el comprador es el propio profesional (la atribución resuelta es el mismo `customer_id`
  del cliente: autocompra).
- **Productos que se listan:** las líneas con `variant_id` y `quantity > 0`. Se **descarta** la línea que no
  tenga ni porción ni modo de uso (tests, kits, servicios, tarjetas de regalo). Si no queda ninguna línea,
  **no se envía nada**.
- **Profesional (opcional):** si `orders.corrected_ref` (o `specialist_ref`) no es vacío ni `"0000"`, se busca
  en `affiliates` y se muestra como "Tu especialista en Vitahub: *Nombre*. Si tienes dudas sobre cómo tomar
  tus suplementos, puedes escribirle." **Nunca** decir que diseñó o recetó el pedido. Solo se lee ese dato;
  no se toca nada de la atribución ni de las comisiones.
- **PDF:** no hay (no existe un protocolo guardado).
- **Pie:** "Esta guía se armó con la información de los productos de tu pedido y es de carácter general. Ante
  cualquier duda, consulta a un profesional de la salud."
- **Ref de idempotencia:** `order_id`.

---

## 3. Cómo armar cada producto

### 3.1 Porción (la guía de compra normal)
Se lee de la variante en Shopify: `custom.tipo_dosis` y `custom.dosis` (entero).
- Si `dosis` es 0 o vacío, o `tipo_dosis` está vacío o es `N/A`: **no hay porción**.
- Texto: `Porción: {dosis} {unidad}`, y si se compraron varios frascos, `· {n} frascos`
  (por ejemplo "Porción: 2 cápsulas · 2 frascos").
- **Unidad:** `tipo_dosis` en minúsculas.
  - Con `dosis = 1` va en singular: se quita la `s` final; las palabras que terminan en `les` o `des` pierden
    `es` ("vegetales" → "vegetal", "unidades" → "unidad"). Con varias palabras se aplica a cada una
    ("Cápsulas vegetales" → "cápsula vegetal").
  - Con `dosis > 1` va como está guardado ("Softgels", "Cápsulas vegetales"); si estuviera en singular se
    pluraliza.
  - `ml`, `mg` y `g` no cambian.
- Convención de los datos: `total_unidades` es el contenido físico del envase, `total_dosis` las porciones del
  envase y `dosis` las unidades por porción. **Para el correo solo se usan `tipo_dosis` y `dosis`.**

### 3.2 Etiqueta (la pastilla) en protocolo y consultorio
En este orden de prioridad:
1. `dosis_map.instruccion` (texto ya redactado por el profesional, por ejemplo "Tomar 2 cápsulas con el
   desayuno y la cena.").
2. `dosis_map.dosis_amount` + `dosis_map.dosis_unit` (por ejemplo "2 cápsulas").
3. `×{cantidad}` si no hay nada.

Si se compraron varios frascos y hay texto de dosis, se agrega ` · {n} frascos`.

### 3.3 Modo de uso
- Viene de `product_catalog.modo_de_uso` por `variant_id`. **Si esa variante no está en el catálogo**, se toma
  de cualquier otra variante del mismo `product_id`: es del producto, no de la variante.
- En `protocolo` y `consultorio` **solo se muestra cuando el profesional no indicó nada** (sin instrucción, sin
  dosis, sin momentos y sin acompañamiento). En `guia_pedido` se muestra siempre que exista.
- Si es nulo, no se muestra esa línea. Nunca se inventa un genérico: es una indicación de salud.

### 3.4 Foto
`product_catalog` → `product_id` → `featuredImage.url` de Shopify, recortada así (agregar al final de la URL):
`?width=240&height=240&crop=center&format=jpg`. Si el producto no está en el catálogo, usar el `product_id` de
la línea de la orden. Si no hay foto, un recuadro vacío del mismo tamaño.

### 3.5 Otros campos del profesional
`momentos[]`, `acompanamiento` y `nota`: se muestran tal cual si vienen. La `nota` va como "Nota: …".
La descripción (`componentes.descripcion` por `product_catalog.componente`) se usa en protocolo y consultorio;
en la guía **no se muestra** descripción.

### 3.6 Título
`product_catalog.title`; si falta, el título de la línea de la orden.

---

## 4. La plantilla (diseño nuevo)

Secciones, de arriba abajo:
1. **Encabezado azul** con el título. En protocolo y consultorio: "Sigue tu protocolo en la app Mi Vitahub".
   En guía: "Cómo tomar tu pedido". La línea pequeña de arriba dice **"Vitahub Pro"** en protocolo y consultorio
   (los clientes son pacientes de profesionales) y **"Vitahub"** en la guía (el cliente no es profesional).
2. **Banda turquesa:** "Protocolo de *nombre*" (protocolo y consultorio) o "Pedido de *nombre*" (guía).
3. **Línea de orden y fecha:** "Orden #…" y la fecha larga en español de México (por ejemplo "6 de noviembre de
   2026"). Sin número de orden en consultorio con efectivo: solo la fecha.
4. **Bloque de la app Mi Vitahub:** imagen del teléfono, el texto "Entra con *correo* y tus suplementos ya van a
   estar cargados" y los botones de App Store y Google Play.
   - iPhone: `https://apps.apple.com/mx/app/id6821184197`
   - Android: `https://play.google.com/store/apps/details?id=mx.vitahub.cliente` (la app ya está publicada)
   - El correo con el que entra a la app es el del cliente de la orden (en consultorio, `patient_email`).
5. **Lista de productos:** foto, etiqueta (pastilla), título, "Modo de uso" si corresponde, "Nota" si existe.
6. **Botón "Descargar mi protocolo en PDF"** (solo protocolo y consultorio).
7. **Bloque de contacto del especialista** (solo guía, y solo si hay referido).
8. **Pie.** Protocolo y consultorio: "Este protocolo fue diseñado para ti por *profesional* a través de Vitahub
   Pro. Para dudas o ajustes, contacta directamente a tu especialista." Guía: el texto de la sección 2.3.

Todos los textos van en español de México, sin voseo ("tú", nunca "vos"). Los colores de la marca son navy
`#1b3f7a` y celeste `#2BB9B8`. El correo debe verse bien en celular y en Gmail, Outlook y Apple Mail
(estructura de tablas, estilos en línea).

---

## 5. Envío y seguimiento

- **Resend:** la misma cuenta y el mismo dominio que usa Pro. Poner el tag `flujo` de la sección 2 y el tag
  `ref` con la referencia de idempotencia.
- **Aperturas y clics:** el webhook de Resend (`email.delivered`, `email.opened`, `email.clicked`,
  `email.bounced`, `email.complained`). Guardar por correo: `tipo`, `ref`, `resend_id`, fechas y contadores.
  Las aperturas de Apple Mail se inflan por su protección de privacidad: tomar los clics como señal más fiable.
- **Ficha del cliente (CRM):** ligar cada correo al cliente por `customer_id` o `email`.
- **Rebotes y quejas:** si un correo rebota o marca spam, no volver a enviar a esa dirección.

---

## 6. Lo que sigue siendo de Pro (no replicar)

- La **atribución** de la venta al profesional y las **comisiones**. VitaPulse solo lee `corrected_ref` /
  `specialist_ref`, nunca los modifica.
- El **PDF del protocolo** (`/api/protocolo-pdf`) y el **armador** de protocolos.
- Escribir `sharecarts.extra.order_number` y `order_date` (los usa el PDF). Lo hace Pro; ver sección 7.
- El **catálogo** (`product_catalog`), que se sincroniza desde Shopify cada hora.

---

## 7. Corte (de Pro a VitaPulse) sin correos duplicados

Hoy Pro envía estos tres correos por Resend. Para que nadie reciba dos:
1. **Modo sombra** (el primero): VitaPulse arma y guarda cada correo sin enviarlo, y se compara con lo que Pro
   mandó (Resend, tag `flujo`) hasta que coincidan en destinatario, productos, porción y modo de uso.
2. **Corte:** se acuerda una fecha y hora. A partir de ahí VitaPulse envía y **Pro se apaga** para estos
   tres correos. **Pendiente del lado de Pro:** agregar un interruptor que apague esos envíos y siga guardando
   `order_number` y `order_date` en el protocolo (para el PDF). Hasta que ese interruptor exista y se active, el
   corte no debe hacerse.
3. Pro conserva su interruptor para volver atrás si algo sale mal.

---

## 8. Casos borde y pruebas

- Orden con un solo producto sin porción ni modo de uso (por ejemplo un test genético): **no se envía** (guía).
- Orden de cita (`booking_appointment_id`): no se envía.
- Orden de profesional comprando para sí (autocompra): no se envía la guía.
- Variante que no está en `product_catalog`: se usa el título de la línea, la foto desde Shopify y el modo de
  uso de otra variante del mismo producto.
- Atribución que llega tarde: por eso se dispara desde `orders` y no desde Shopify.
- El mismo evento recibido dos veces (reintento del webhook): la restricción única de `(tipo, ref)` evita el
  duplicado.
- Correo sin `@` o con formato inválido: no enviar y registrar.
- Pruebas: una variable `DESTINO_PRUEBA` que redirija todos los envíos a un solo correo, para validar la
  plantilla con órdenes reales sin que le llegue al cliente.

## 9. Lista de aceptación

- [ ] Los tres tipos de correo llegan con el diseño nuevo, en celular y en escritorio.
- [ ] Una orden con protocolo, una venta en efectivo, una venta de consultorio por Shopify y una compra normal
      producen cada una **un solo** correo con el contenido correcto.
- [ ] Una orden con una variante que no está en el catálogo sale con foto y modo de uso.
- [ ] "1 unidad" y "2 unidades", "1 cápsula vegetal" y "2 cápsulas vegetales" salen bien.
- [ ] Las aperturas y los clics aparecen en la ficha del cliente.
- [ ] Ningún correo histórico se envía; solo los posteriores al corte.
- [ ] Un reintento no duplica el correo.
