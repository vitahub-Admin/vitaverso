> **Versión anterior y completa (20-oct-2026), guardada como referencia.** Incluye voz y tono, tipografía, superficies y correos, que el manual vigente (`manual-de-marca.md`) dejó fuera a propósito para enfocarse en colores y formas. **Ojo:** en esta versión el acento aparece como `#1E8FA8`; el celeste principal de la marca es **`#2BB9B8`**, como indica el manual vigente.

# Manual de marca · Vitahub

**Versión 1.0 · 20 de octubre de 2026**

Este documento reúne lo que **ya existe** de la marca en la tienda, en la plataforma para profesionales y en las dos apps, y lo ordena en un solo lugar. Donde los proyectos se contradicen, lo dice y propone una decisión. Lo que es propuesta (y no algo ya en uso) está marcado como **Propuesta**; lo que falta decidir, como **Por decidir**.

> Los valores salen del código y de los archivos de cada proyecto. Cuando un valor se midió (por ejemplo, el color del logo), se indica. Cuando no se encontró algo, se dice que no se encontró.

---

## 1. La marca

### 1.1 Nombre y familia de productos

| Producto | Qué es | Dónde vive | Para quién |
|---|---|---|---|
| **Vitahub** | Tienda de suplementos | vitahub.mx (Shopify) | Clientes y pacientes |
| **Vitahub Pro** · *Profesionales* | Plataforma para profesionales de la salud: protocolos, ventas con comisión, consultorio, billetera | pro.vitahub.mx | Nutriólogos, médicos y otros profesionales |
| **Vitahub Pro** (app móvil) | La plataforma en el teléfono | App Store y Google Play (`mx.vitahub.afiliados`) | Profesionales |
| **Mi Vitahub** (app móvil) | Seguimiento de pedidos, suplementos y notificaciones del paciente | En preparación para su lanzamiento (`mx.vitahub.cliente`) | Clientes y pacientes |

*Vitaverse* es el nombre interno de la carpeta de trabajo. **No se usa de cara al público.**

### 1.2 Cómo se escribe el nombre

- En texto corrido: **Vitahub** (solo la V en mayúscula).
- El logotipo va siempre en minúsculas (*vitahub*): es parte del dibujo del logo, no una forma de escribir el nombre.
- Evitar **VitaHub** y **VITAHUB**. Hoy aparecen en algunos textos (por ejemplo, en Mi Tienda: "sobre VitaHub"). **Por decidir:** unificar en "Vitahub".
- La plataforma se llama **Vitahub Pro**, y su subtítulo es **Profesionales**.

### 1.3 Qué debe sentir quien nos ve

Una marca de salud que **da confianza sin ser fría**. En la tienda es cercana y clara. En Vitahub Pro es más precisa y clínica: un profesional está trabajando, no comprando. Nada de promesas de curas ni lenguaje de infomercial.

---

## 2. Logotipo

### 2.1 Versiones y archivos

| Versión | Archivo | Medidas | Uso |
|---|---|---|---|
| **Vitahub Pro, con "Profesionales"** | `vitaverse/public/LOGO.png` | 2588 × 757 | Plataforma web (encabezado y acceso) |
| **Vitahub, solo palabra** | `vitaverse/public/logosimple.png` | 1884 × 456 | Mi Tienda y espacios sin la palabra Pro |
| **Vitahub, solo palabra (app clientes)** | `vitaverse-cliente/assets/LOGONOMBRE.png` | 1884 × 456 | Encabezado de Mi Vitahub |
| **Ícono de app clientes** | `vitaverse-cliente/assets/icon.png`, `adaptive-icon.png`, `splash-icon.png`, `notification-icon.png` | 1024² y 512², 96² | Ícono, pantalla de arranque y notificaciones |
| **Ícono de app Pro** | `vitaverse-afiliados/assets/LOGOV.png`, `icon.png`, `adaptive-icon.png`, `notification-icon.png` | 1024², 94² | Ícono, arranque y notificaciones |
| **Logo de la tienda** | En Shopify: `Logo_Vitahub_sin_bajada_1.png` y `Fav.png` | — | Tema vigente. No vienen en el respaldo del tema: hay que descargarlos desde Contenido → Archivos |

### 2.2 Cómo está construido

- Palabra **vitahub** en minúsculas, en una tipografía **geométrica de trazo grueso**, en azul. La *v* es una cuña, y la *t* termina en una cola curva.
- En la versión Pro, **"Pro"** va a la derecha, en **cursiva ligera** y en turquesa.
- **"Profesionales"** va debajo, centrado, en Lato con las letras bien separadas, en azul.

### 2.3 Colores del logo (medidos en los archivos)

| Color | Valor | Dónde |
|---|---|---|
| Azul del logo | **≈ #1B3F7A** (muestreado #184078) | La palabra *vitahub* y "Profesionales" |
| Turquesa del logo | **≈ #30B8B8** | La palabra "Pro" |

El turquesa del logo **no es** el turquesa que se usa en las pantallas (`#1E8FA8`). Ver la sección 3.4.

### 2.4 Reglas de uso (Propuesta)

Nada de esto está escrito hoy en ningún lado. Es lo que conviene adoptar:

- **Fondo:** claro o blanco. No existe una versión del logo para fondo oscuro (blanca). **Por decidir:** crearla antes de usar el logo sobre azul.
- **Espacio libre:** como mínimo, la altura de la letra *t* alrededor de todo el logo.
- **Tamaño mínimo:** 96 px de ancho en pantalla para la palabra sola. Para el logo con "Profesionales", 140 px. Por debajo de eso el subtítulo se vuelve ilegible.
- **No** estirar, girar, cambiar los colores, agregar sombras ni poner el logo sobre fotos sin un fondo liso.
- **Proporción de uso actual en la plataforma:** 273 × 80 px.

### 2.5 Pendientes del logo

- El **acceso de Mi Vitahub** todavía muestra un círculo con una "V" y el texto "Vitahub" de relleno, y no el logo (`vitaverse-cliente/app/login.js`). Está anotado como pendiente en el `CLAUDE.md` de esa app.
- Hay **tres nombres de archivo distintos** para el logo en las dos apps (`LOGOV`, `LOGONOMBRE`, `splash`). **Por decidir:** un solo juego de archivos maestros en una carpeta común.

---

## 3. Color

### 3.1 Paleta base (la que más se usa en la plataforma Pro)

El conteo es de cuántas veces aparece cada valor en el código de la plataforma.

| Rol | Nombre | Hex | Usos |
|---|---|---|---|
| **Primario** | Navy | **#1B3F7A** | 523 |
| **Acento** | Teal | **#1E8FA8** | 271 |
| Texto secundario | Slate | #5B7A8C | 220 |
| Borde | Borde | #D0E4EC | 172 |
| Texto tenue | Muted | #B0C8D4 | 107 |
| Fondo de página | Fondo | #F7F9FB | 76 |
| Texto terciario | Slate claro | #8AAAB8 | 54 |
| Separador suave | — | #EEF3F7 | 49 |
| Borde de selección | Teal borde | #C2DFE8 | 49 |
| Fondo de selección | Teal claro | #E6F4F8 | 33 |
| Fondo de ítem prescrito | Teal pálido | #F4FAFB | 16 |
| Encabezados oscuros | Navy profundo | #0D2133 | 12 |
| Hover del primario | Navy hover | #162D60 | 13 |

### 3.2 Colores de estado

| Estado | Plataforma web | Apps |
|---|---|---|
| Error / sin stock | rojo 500 sobre rojo 50 | `#EF4444` / `#FEE2E2` |
| Aviso / últimas unidades | ámbar 600 sobre ámbar 50 | `#F59E0B` / `#FEF3C7` |
| Éxito / confirmado | verde esmeralda 600 | `#10B981` / `#D1FAE5` |
| WhatsApp | — | `#25D366` (solo para su botón) |

### 3.3 Reglas de uso

- **El azul primario `#1B3F7A` es el color de las acciones principales:** botón primario, encabezados y títulos.
- **El teal `#1E8FA8` es para selección activa, ganancia y datos positivos.** No para botones principales.
- El **navy profundo `#0D2133`** se reserva para encabezados oscuros de sección, no para botones.
- Los **colores de estado nunca son el acento de la marca**: sirven solo para decir qué pasó.
- El fondo de página es `#F7F9FB`, y las tarjetas van en blanco con borde `#D0E4EC`.

> **Corrección sobre el documento de diseño interno.** La guía en `.claude/skills/diseño` dice que los botones primarios son `#0D2133`. En el código real, el botón primario es **`#1B3F7A`** (523 usos contra 12 de `#0D2133`). Este manual toma `#1B3F7A` como válido.

### 3.4 Contradicciones entre proyectos

| Tema | Plataforma Pro | App Pro | App Mi Vitahub | Tienda (tema Shopify) |
|---|---|---|---|---|
| Azul primario | #1B3F7A | #1B3F7A | #1B3F7A | #1B3F7A *(más #334FB4, residuo del tema base)* |
| Azul medio | #2A5298 (poco) | #2A5298 | **#2D5AA8** | — |
| Acento | **Teal #1E8FA8** | **Ámbar #F59E0B** | Sin acento | **Turquesas #2DB9B8, #0D86A1, #16788F** |
| Fondo | #F7F9FB | #F5F7FB | **#FFFFFF** | #FFFDFC |
| Turquesa del logo | ≈ #30B8B8 | — | — | — |

**Decisiones propuestas:**
1. **Azul primario único: `#1B3F7A`** (ya coincide en los cuatro lados).
2. **Azul medio único:** elegir uno de `#2A5298` o `#2D5AA8`. Hoy dos apps usan valores distintos para lo mismo.
3. **Acento:** el teal de las pantallas (`#1E8FA8`) no coincide con el turquesa del logo (≈ `#30B8B8`) ni con el de la tienda (`#2DB9B8`). **Por decidir:** un solo turquesa de marca, o dejar uno para el logo y otro, más oscuro, para texto en pantalla. Las apps hoy **no usan teal**, aunque el `CLAUDE.md` de Mi Vitahub dice que Pro lo agrega.
4. **Quitar `#334FB4`** del tema de la tienda: viene del tema base y no es de la marca.

### 3.5 Legibilidad (contraste medido)

La norma WCAG pide 4.5 para texto normal y 3.0 para texto grande (más de 18 px, o 14 px en negrita).

| Combinación | Contraste | Resultado |
|---|---|---|
| Navy `#1B3F7A` sobre blanco, y blanco sobre navy | **10.3** | Muy bien en cualquier tamaño |
| Blanco sobre navy profundo `#0D2133` | **16.4** | Muy bien |
| Navy sobre teal claro `#E6F4F8` | **9.2** | Muy bien |
| Gris secundario de las apps `#6B7280` sobre blanco | 4.8 | Bien |
| Slate `#5B7A8C` sobre blanco | 4.6 | Justo; bien |
| Slate `#5B7A8C` sobre fondo de página `#F7F9FB` | 4.3 | **Solo texto grande** |
| Teal `#1E8FA8` sobre blanco, y blanco sobre teal | **3.8** | **Solo texto grande o elementos**, no texto chico |
| Teal sobre teal claro | 3.4 | Solo texto grande |
| Rojo `#EF4444` sobre blanco | 3.8 | Solo texto grande |
| Slate claro `#8AAAB8` sobre blanco | 2.5 | **No cumple** |
| Turquesa del logo `#30B8B8` sobre blanco | 2.4 | **No cumple** como texto |
| Muted `#B0C8D4` sobre blanco | **1.7** | **No cumple** |
| Gris tenue `#9CA3AF` sobre blanco | 2.5 | **No cumple** |
| Verde éxito `#10B981` y ámbar `#F59E0B` sobre blanco | 2.5 y 2.2 | **No cumplen** como texto |

**Qué implica hoy:**
- La plataforma usa teal en **etiquetas de 10 y 11 píxeles** (por ejemplo, la variante del producto). Ese tamaño con ese contraste no cumple.
- Se usa muted `#B0C8D4` para textos de ayuda (`text-xs`). **No cumple.**
- **Propuesta:** usar `#B0C8D4` y `#8AAAB8` solo para marcadores decorativos, íconos y estados deshabilitados; nunca para texto que haya que leer. Para texto chico de acento, usar un teal más oscuro. El estado verde y ámbar, acompañarlos siempre con un ícono o un texto, no solo con el color.

---

## 4. Tipografía

### 4.1 Tipografía de marca

**Lato** (pesos 400 y 700; la plataforma usa además variantes más gruesas en etiquetas y totales).

| Superficie | Tipografía | Dónde |
|---|---|---|
| Plataforma Pro (web) | Lato | `globals.css`, clase `font-lato` |
| App Pro y Mi Vitahub | Lato 400 y 700 | `constants/theme.js` de cada app |
| Correos | Arial / Helvetica (de respaldo) | Plantilla del protocolo |
| **Tienda (tema Shopify)** | **Assistant 600** en títulos, **Quicksand 400** en cuerpo, **Lato** en etiquetas y descuentos | `settings_data.json`, `custom2024.css` |

**Por decidir:** la tienda mezcla **tres familias** (Assistant, Quicksand y Lato), y el resto de la marca usa solo Lato. Propuesta: Lato en todo. Mientras tanto, la tienda ya carga Lato, así que el cambio es poco costoso.

### 4.2 Escala en la plataforma Pro

| Rol | Estilo |
|---|---|
| Etiqueta de campo o sección | 10 px, extranegrita, mayúsculas, espaciado amplio, Slate |
| Etiqueta de componente | 10 px, extranegrita, mayúsculas, espaciado amplio, Teal |
| Nombre de producto | `text-sm`, negrita, Navy |
| Variante | 11 px, extranegrita, mayúsculas, Teal |
| Precio | `text-sm`, extranegrita, números tabulares |
| Total grande | `text-lg`, extranegrita, números tabulares |
| Descripción clínica | `text-xs`, Slate, interlineado amplio |
| Texto de ayuda | `text-xs`, Muted *(ver sección 3.5)* |

### 4.3 Escala en las apps

Tamaños más usados: **12, 13, 14, 15, 16**. Títulos: **18, 24, 26**. Todos los valores van sueltos en cada pantalla; no hay una escala definida en código. **Propuesta:** fijar 11, 12, 14, 16, 18, 24 como escala oficial.

### 4.4 Números

Todos los precios y cantidades en columnas deben usar **números tabulares** (`tabular-nums`), para que se alineen.

---

## 5. Forma, componentes y layout

### 5.1 Radios, bordes y sombras

| | Plataforma Pro | Apps | Tienda |
|---|---|---|---|
| Tarjetas | Redondeadas (`rounded-2xl`, interior `rounded-xl`) | 10 a 20 px | 0 por defecto, con muchas excepciones de 8 a 50 px |
| Botones | `rounded-xl` | 12 px | 0 por defecto |
| Campos | `rounded-lg` | 10 a 12 px | 0 |
| Píldoras e insignias | Completas | 20 a 24 px | 40 px |
| Borde | 1 px `#D0E4EC` | 1 px `#E5E7EB` | 1 px |
| Sombra | Casi ninguna | Muy suave (opacidad 0.05 a 0.06) | Ninguna |

**Por decidir:** el tema de la tienda es cuadrado en su base, pero sus secciones propias son redondeadas. Hoy la tienda se ve distinta de todo lo demás. Propuesta: radios de 12 a 16 px en la tienda también.

### 5.2 Layout de la plataforma Pro

- **Dos columnas en escritorio:** contenido principal a la izquierda y panel pegajoso a la derecha (320 px).
- **Una columna en móvil,** con la acción principal en un pie fijo.
- **Scroll interno** en la caja de contenido, nunca en el cuerpo de la página.
- **Menús desplegables flotantes**, sin empujar el contenido.
- Encabezado oscuro de sección: fondo navy profundo, título blanco y subtítulo en azul claro `#7EAEC0`.

### 5.3 Reglas de aplicación

1. Nunca recortar el nombre de un producto en la vista de prescripción.
2. Los precios siempre con números tabulares.
3. El stock y la dosis son información crítica: insignias con color de estado, nunca ocultas.
4. Los botones primarios van en azul `#1B3F7A`.
5. El teal es para selección activa, ganancia y datos positivos.
6. El scroll es interno al contenedor.
7. Los menús desplegables son flotantes.
8. En móvil, una columna con el botón principal fijo al pie.

### 5.4 Iconos

**Lucide** en la plataforma y en las dos apps. Un solo conjunto, con trazo uniforme. No mezclar con otros.

### 5.5 Emojis

Solo en **títulos de notificaciones** y siempre al final (🎁 💸 🛒 🔄). **No** en botones, menús ni textos de pantalla.

---

## 6. Voz y tono

### 6.1 Reglas fijas

1. **Español de México, tratando de "tú".**
2. **Nunca voseo.** Nada de "tenés", "podés", "querés", "compartí", "elegí", "en vos".
3. **"Correo"** y no "email". La app de clientes ya lo hace así; la app Pro usa "email".
4. **Verbos concretos en los botones:** "Publicar", no "Aceptar". Y el aviso posterior dice lo mismo: "Publicado".
5. **Mejor vacío que inventado** en cualquier dato de salud (modo de uso, dosis, indicaciones). Si no hay dato, no se rellena con un texto genérico.

### 6.2 Dos registros

| | **Mi Vitahub** y la tienda | **Vitahub Pro** |
|---|---|---|
| Quién habla | Un acompañante claro y cálido | Una herramienta clínica precisa |
| Persona | "tú" | "tú" |
| Vocabulario | Cotidiano: "tu pedido", "tu stack de hoy" | Profesional: "Protocolo", "Prescripción", "Componente", "Paciente" |
| Frases | Cortas, amables | Cortas, directas, con el dato primero |
| Ejemplo | "Aún no tienes pedidos. Tus compras en vitahub.mx aparecerán aquí." | "Todavía no compartiste ningún protocolo." |

### 6.3 Patrones

**Estado vacío:** "Aún no tienes…" o "Todavía no hay…", y enseguida qué hacer.
> *"Todavía no tiene nada. Registra una entrega arriba."*

**Error:** qué falló y cómo resolverlo. Sin disculpas vacías y sin culpar a quien escribe.
> *"No pudimos consultar las tarifas de envío. Intenta de nuevo en un momento."*

**Confirmación:** el verbo exacto en pasado.
> *"Entrega registrada · quedan 3 unidades."*

**Notificación push:** título con signos de exclamación a ambos lados cuando es una buena noticia, y un emoji al final.
> *"¡Tu pago fue aprobado! 💸"* · *"¡Vendiste! 🛒"* · *"¡Tienes un cupón! 🎁"*

**Correos:** asunto que dice qué es y de quién viene.
> *"Tu protocolo de suplementación — Vitahub Pro"*

### 6.4 Palabras

| Usar | Evitar |
|---|---|
| profesional | afiliado *(por decidir, ver abajo)* |
| paciente | usuario, cliente (cuando lo ve el profesional) |
| correo | email, mail |
| consultorio | sucursal, punto de venta |
| protocolo | plan, receta |
| ganancia, comisión | bonificación, premio |

**Por decidir: "afiliado" o "profesional".** El código y la base de datos dicen *afiliado* en todas partes, y también algunas pantallas ("Tu link de afiliado", "¿Aún no eres afiliado?"). Hacia el profesional, lo más claro es **profesional**. Propuesta: *afiliado* queda solo para lo interno y lo legal.

### 6.5 Lo que no se dice

- Promesas de curar, tratar o prevenir una enfermedad.
- "Mejor", "el más efectivo" o comparaciones sin un dato verificable.
- Descuentos sin un precio de referencia real. Profeco distingue una **oferta** (rebaja directa al precio) de una **promoción** (con condiciones), y el precio anunciado debe ser el cobrado.
- La publicidad de suplementos tiene reglas ante COFEPRIS. **No se verificaron para este manual:** conviene revisarlas con un asesor antes de escribir textos de salud.

---

## 7. Cada superficie

### 7.1 Tienda (vitahub.mx)

- **Tema:** base de septiembre de 2024 (`theme_export__vitahub-mx-copia-de-vitahub-main__23SEP2024-0755pm`), con un parche de septiembre de 2026 en `_theme` (carrito y los módulos de Pro).
- **Mensajes de la tienda hoy:** "Más que una tienda", "Confianza en expertos", "Bienestar a tu alcance", "Con expertos en nutrición y medicina funcional", "Realizamos envíos a toda la república".
- **Atención a este dato:** el tema dice **"Envío y cita nutrifuncional gratis desde $499"**. Las tarifas de envío actuales en Shopify marcan envío gratis desde **$599**. Puede ser un texto viejo del respaldo de 2024. **Por verificar en la tienda real.**
- Escritura de "nutrifuncional": aparece también "nutri-funcional". **Por decidir:** una sola forma.
- No se encontró un eslogan formal, un texto de garantía ni los enlaces a redes sociales.

### 7.2 Plataforma Pro (pro.vitahub.mx)

- Menú lateral: Inicio · Mis Contactos · Analytics · Protocolos Clínicos · Mis Protocolos · Mi Tienda · Mis Citas · Comunidad · Academia Vitahub · Invita y gana · Wallet.
- Los nombres de menú van con **cada palabra importante en mayúscula** ("Protocolos Clínicos"), y los textos de pantalla en minúscula normal.
- Secciones de administración (solo equipo): Consignación, Notificaciones Admin, Badges Admin, entre otras.

### 7.3 Apps

| | Vitahub Pro | Mi Vitahub |
|---|---|---|
| Versión | 1.2.0 | 1.1.0 |
| Fondo de pantalla | `#F5F7FB` | `#FFFFFF` |
| Tarjeta | blanco, sombra suave | blanco, borde `#E8ECF2` y sombra suave |
| Arranque | fondo `#1B3F7A` con el ícono | fondo `#1B3F7A`, ícono de 160 px |
| Estilo de interfaz | claro | claro |
| Soporte | — | WhatsApp +52 56 5438 8525 |

### 7.4 Correos (Resend)

| Remitente | Para qué |
|---|---|
| `Vitahub Pro <noreply@pro.vitahub.mx>` | Correos de la plataforma: protocolo, código de acceso |
| `Vitahub <noreply@pro.vitahub.mx>` | Otros correos transaccionales |
| `Vitahub Novedades <novedades@vitahub.mx>` | Newsletter |

- Colores de la plantilla de protocolo: azul `#1B3F7A` en encabezados y botones, fondo `#F7F9FB`, texto gris `#6B7280`, y un azul claro `#7EB8C9` de apoyo. Tipografía de respaldo: Arial.
- **Todo correo masivo** lleva enlace de baja visible y el encabezado de baja. Ver la guía del newsletter.

### 7.5 PDF del protocolo

Cada producto va con su nombre completo, su dosis y, cuando el profesional no escribió una indicación, el **modo de uso del producto**. Su diseño no se auditó en detalle para este manual; las reglas de voz de la sección 6 le aplican igual.

---

## 8. Inconsistencias a resolver

Ordenadas de más a menos importante para el cliente final.

| # | Tema | Qué pasa | Propuesta |
|---|---|---|---|
| 1 | **Turquesa** | Cuatro valores distintos: logo, pantallas, tienda y apps | Un turquesa de marca y uno oscuro para texto |
| 2 | **Contraste** | Texto chico en teal y en muted que no cumple | Ver sección 3.5 |
| 3 | **Tipografía de la tienda** | Tres familias, cuando el resto usa solo Lato | Lato en todo |
| 4 | **Radios de la tienda** | Cuadrada en su base, redondeada en lo propio | 12 a 16 px |
| 5 | **Logo en el acceso de Mi Vitahub** | Círculo con "V" de relleno | Poner el logo real |
| 6 | **Voseo en la app Pro** | "Verificá", "Todavía no hiciste", "Ya podés", "Contactá" (en `cobros.js` y `mi-tienda.js`) | Corregir; la plataforma web ya se corrigió |
| 7 | **"email" vs "correo"** | La app Pro dice "email" | Unificar a "correo" |
| 8 | **Nombre** | VitaHub, VITAHUB y Vitahub | Vitahub |
| 9 | **Envío gratis** | Tema dice desde $499; tarifas desde $599 | Verificar en la tienda real |
| 10 | **Azul medio** | `#2A5298` y `#2D5AA8` | Uno solo |
| 11 | **Logo en fondo oscuro** | No hay versión blanca | Crearla |
| 12 | **Archivos del logo** | Nombres distintos en cada proyecto | Una carpeta común |
| 13 | **Fondo de apps** | Blanco en una, gris azulado en la otra | Elegir uno |
| 14 | **Acento ámbar** | Solo en la app Pro | Decidir si es parte de la marca |
| 15 | **`pro-marca`** | Proyecto sin identidad definida (sin nombre, colores ni logo) | Se define cuando se decida el nombre |

---

## 9. Antes de publicar algo nuevo

- [ ] ¿El nombre está escrito "Vitahub"?
- [ ] ¿Hay voseo? Buscar "tenés", "podés", "querés", "-á" en imperativo (compartí, elegí).
- [ ] ¿Dice "correo" y no "email"?
- [ ] ¿Los textos chicos tienen contraste suficiente (4.5 o más)?
- [ ] ¿Los botones dicen un verbo concreto?
- [ ] ¿El estado vacío dice qué hacer?
- [ ] ¿Los precios llevan números tabulares?
- [ ] ¿Los colores de estado van acompañados de ícono o texto?
- [ ] ¿Hay algún dato de salud inventado o genérico? Si sí, quitarlo.
- [ ] ¿Las ofertas muestran un precio de referencia real?
- [ ] Si es un correo masivo: ¿lleva enlace de baja y remitente correcto?

---

## 10. Apéndice: valores listos para copiar

### Tokens de color

```js
export const COLORES = {
  // Marca
  navy:        '#1B3F7A',   // primario
  navyHover:   '#162D60',
  navyProfundo:'#0D2133',   // encabezados oscuros
  teal:        '#1E8FA8',   // acento en pantalla
  tealClaro:   '#E6F4F8',
  tealPalido:  '#F4FAFB',
  tealBorde:   '#C2DFE8',

  // Neutros
  slate:       '#5B7A8C',
  slateClaro:  '#8AAAB8',   // solo decorativo
  muted:       '#B0C8D4',   // solo decorativo
  borde:       '#D0E4EC',
  separador:   '#EEF3F7',
  fondo:       '#F7F9FB',
  blanco:      '#FFFFFF',

  // Estado
  error:       '#EF4444',
  aviso:       '#F59E0B',
  exito:       '#10B981',
  whatsapp:    '#25D366',    // solo para su botón
};
```

### Tipografía

```css
font-family: 'Lato', sans-serif;      /* pesos 400, 700, 900 */
font-variant-numeric: tabular-nums;   /* precios y cantidades */
```

### Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Logos de la plataforma | `vitaverse/public/LOGO.png`, `logosimple.png` |
| Tema de colores de la app de clientes | `vitaverse-cliente/constants/theme.js` |
| Tema de colores de la app Pro | `vitaverse-afiliados/constants/theme.js` |
| Reglas de idioma y de diseño de la app de clientes | `vitaverse-cliente/CLAUDE.md` |
| Guía de diseño interna de la plataforma | `vitaverse/.claude/skills/diseño/SKILL.md` |
| Colores y tipos del tema de la tienda | `theme_export__…/config/settings_data.json` y `assets/custom2024.css` |
| Contrato de notificaciones y cupones | `vitaverse/docs/notificaciones-openapi.yaml` |
