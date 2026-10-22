# FRONTEND_BRIEF · Vitahub Pro (pro.vitahub.mx)

**Mapa del código del frontend.** No es un manual de diseño. Cada punto lleva rutas de archivo relativas a la raíz del repo; si algo no existe, dice **"no existe"**. Solo hechos verificados en el código.

- **Revisado:** 20 de octubre de 2026.
- **Cómo se contó:** `grep` y scripts de Node sobre `src/`. "Ocurrencias" cuenta cada aparición del valor; "líneas" cuenta líneas que contienen el patrón (un elemento escrito en varias líneas se cuenta por línea).
- **Resumen de lo que no existe:** archivo de tokens · `tailwind.config` · bloque `@theme` · variables CSS · librería de componentes · componentes de botón, campo, tarjeta, insignia, chip, pestañas, aviso (toast) · carga de ninguna fuente · archivo de i18n · sanitización del HTML de Shopify · logo en SVG.

---

## 1. package.json: framework y librerías

| Tema | Valor | Dónde se verifica |
|---|---|---|
| Framework | **Next.js 16.3.0** instalado (`^16.0.7` en `package.json`), **App Router** (`src/app`). Se corre con `next dev --turbopack` | `package.json`, `node_modules/next/package.json` |
| React | **19.2.1** (`react` y `react-dom`) | `package.json` |
| Lenguaje | JavaScript (`.js` y `.jsx`). **TypeScript: no existe.** Alias `@/*` → `./src/*` | `jsconfig.json` |
| Tailwind | **4.1.12**, con `@tailwindcss/postcss` ^4. Se carga con `@import "tailwindcss";` | `postcss.config.mjs`, `src/app/globals.css` |
| Librería de componentes | **No existe.** Sin shadcn/ui, Radix, Headless UI ni `components.json`. Tampoco `clsx`, `class-variance-authority`, `tailwind-merge` ni `framer-motion` | `package.json` |
| Íconos | **lucide-react 0.544.0** (51 archivos, 66 íconos distintos). Secundaria: **react-icons 5.5.0** (4 archivos, solo `react-icons/fa`) | `package.json`, `grep` de imports |
| Gráficos | **recharts 3.1.2** (6 archivos) | `grep` |
| Tablas | `ag-grid-community` y `ag-grid-react` 35 (1 archivo); tablas HTML a mano (6 archivos) | `grep` |
| PDF | `@react-pdf/renderer` | `src/app/api/protocolo-pdf/route.js` |
| Dependencias instaladas sin uso | `react-router-dom` (0 imports), `@tanstack/react-table` (0 imports) | `grep` en `src/` |
| Plugin de tipografía de Tailwind (`@tailwindcss/typography`) | **No existe.** El código usa las clases `prose`, `prose-sm`, `prose-xs` (6 usos) que, sin el plugin, no producen estilos | `package.json`; ver §8 |
| Estado | React Context + `useState`: `src/app/context/CustomerContext.jsx`, `SidebarContext.jsx`, `TourContext.jsx`. No hay Redux ni Zustand | |
| Layout raíz | `src/app/layout.js` es un componente de cliente (`"use client"`). Declara `<html lang="en">` (línea 277). `src/app/_document.jsx` es un archivo del Pages Router (con `lang="es"`) que el App Router no usa | |

---

## 2. Tokens de color, radio, sombra y espaciado

**Archivo de tokens: no existe.** No hay `tailwind.config.*`, no hay bloque `@theme`, y no hay ninguna variable CSS (`--…`) definida en el código. Los colores, radios, sombras y espaciados son clases de Tailwind escritas directamente en cada componente, la mayoría como valores arbitrarios (`bg-[#1B3F7A]`).

El único archivo de estilos globales es `src/app/globals.css`. Su contenido literal (50 líneas):

```css
@import "tailwindcss";


.font-lato {
  font-family: 'Lato', sans-serif;
}

.imagen-mitienda{

  width: 200px;
  max-width: 200px;
  max-height: 200px;
}
.sticky-columns {
  position: sticky;
  left: 0;
  background: white;
  z-index: 20;
}

/* Mejorar rendimiento del sticky */
.sticky-columns,
.sticky-header {
  will-change: transform;
  backface-visibility: hidden;
}

/* Sombra sutil para separar columnas sticky */
.sticky-columns::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  width: 2px;
  box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);
}
/* Marcador de "novedad" en el nav: una flecha que va y viene señalando el
   ítem nuevo. Se anima con `translate` y no con `transform`: el ícono usa
   transform para la rotación y se pisarían entre sí. */
@keyframes vaiven-flecha {
  0%, 100% { translate: 0 0; }
  50%      { translate: -5px 0; }
}
.flecha-nuevo {
  animation: vaiven-flecha 1.1s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .flecha-nuevo { animation: none; }
}
```

| Tema | Situación |
|---|---|
| Colores | Sin tokens. Ver §3 |
| Radios | Escala por defecto de Tailwind (`rounded-xl` 240, `rounded-lg` 236, `rounded-full` 189, `rounded-2xl` 125, `rounded` 90, `rounded-md` 4, `rounded-sm` 2). Radios arbitrarios (`rounded-[…]`): **no existen** |
| Sombras | Escala por defecto (`shadow-sm` 89, `shadow` 30, `shadow-md` 26, `shadow-lg` 14, `shadow-2xl` 11, `shadow-xl` 6) y 2 arbitrarias: `shadow-[0_0_0_3px_rgba(27,63,122,0.08)]` (5) y `shadow-[0_0_14px_2px_rgba(30,143,168,0.45)]` (1) |
| Espaciados | Escala por defecto de Tailwind. Más usados: `gap-2` 250, `px-4` 217, `py-3` 158, `px-3` 141, `gap-3` 136, `py-2` 134, `gap-1.5` 111, `p-4` 95 |

---

## 3. Colores que aparecen en `src/` (fuera de un archivo de tokens, que no existe)

**Resumen:** 78 hex de 6 dígitos distintos · 7 hex de 3 dígitos · 16 valores `rgb()/rgba()` distintos · **0 `hsl()`** (no existe) · además, clases de color con nombre de Tailwind (§3.4).

### 3.1 Los cuatro valores que pidieron

| Valor | Ocurrencias | Dónde |
|---|---:|---|
| **`#1E8FA8`** | 271 | 24 archivos. Principales: `armador-carritos/page.jsx` 98, `mis-protocolos/page.jsx` 44, `admin/protocols/page.jsx` 18 |
| **`#1E3A5F`** | 26 | **Solo** `admin/protocols/page.jsx` (26) |
| **`#2A5298`** | 6 | `sharecarts/page.jsx` 3, `admin-notificaciones/ClientesNotificaciones.jsx` 1, `admin-notificaciones/page.jsx` 1, `components/Banner.jsx` 1 |
| **Verde del botón Ayuda** | — | **No es un hex: es la clase de Tailwind `bg-emerald-500 text-white … hover:bg-emerald-600`** en `src/app/components/Sidebar.jsx:337-338`. Su valor en Tailwind v4 (`node_modules/tailwindcss/theme.css:87-88`): `emerald-500` = `oklch(69.6% 0.17 162.48)` ≈ **`#00BC7D`**; `emerald-600` = `oklch(59.6% 0.145 163.225)` ≈ **`#009966`** |

### 3.2 Otros colores con nombre, mencionados en la revisión

| Elemento | Clase | Valor en Tailwind v4 | Dónde |
|---|---|---|---|
| "Cerrar sesión" (menú) | `text-red-400 hover:bg-red-50 hover:text-red-500` | `red-400` = `oklch(70.4% 0.191 22.216)` ≈ `#FF6467` | `components/Sidebar.jsx:353` |
| "Cerrar sesión" (encabezado) | `text-gray-400 hover:bg-red-50 hover:text-red-500` | `gray-400` = `oklch(70.7% 0.022 261.325)` | `components/Header.jsx` (botón `LogOut`) |
| Ícono de CLABE | `bg-amber-50 text-amber-600` (es **ámbar**, no naranja) | `amber-50` ≈ `#FFFBEB`; `amber-600` = `oklch(66.6% 0.179 58.318)` ≈ `#E17100` | `mis-datos/page.jsx:219` |
| Fondo del encabezado | `bg-[#fafafa]` | `#FAFAFA` | `components/Header.jsx:21` |

### 3.3 Tabla completa de colores literales

**Hex de 6 dígitos (78 distintos)**
| Valor | Usos | Archivos (los 3 principales) |
|---|---:|---|
| `#1B3F7A` | 523 | armador-carritos/page.jsx (99), mis-protocolos/page.jsx (33), wallet/page.jsx (22) |
| `#1E8FA8` | 271 | armador-carritos/page.jsx (98), mis-protocolos/page.jsx (44), admin/protocols/page.jsx (18) |
| `#5B7A8C` | 220 | armador-carritos/page.jsx (92), mis-protocolos/page.jsx (22), admin-notificaciones/ClientesNotificaciones.jsx (15) |
| `#D0E4EC` | 172 | armador-carritos/page.jsx (64), cobro/[id]/page.jsx (19), home/page.jsx (13) |
| `#B0C8D4` | 107 | armador-carritos/page.jsx (40), cobro/[id]/page.jsx (12), mis-protocolos/page.jsx (10) |
| `#F7F9FB` | 76 | armador-carritos/page.jsx (30), cobro/[id]/page.jsx (8), home/page.jsx (7) |
| `#8AAAB8` | 54 | armador-carritos/page.jsx (16), admin-notificaciones/ClientesNotificaciones.jsx (8), admin/consignacion/page.jsx (7) |
| `#C2DFE8` | 49 | armador-carritos/page.jsx (26), mis-protocolos/page.jsx (17), protocolos-compartidos/page.jsx (2) |
| `#EEF3F7` | 49 | armador-carritos/page.jsx (15), mis-protocolos/page.jsx (11), cobro/[id]/page.jsx (4) |
| `#E6F4F8` | 33 | mis-protocolos/page.jsx (12), armador-carritos/page.jsx (9), protocolos-compartidos/page.jsx (3) |
| `#1E3A5F` | 26 | admin/protocols/page.jsx (26) |
| `#163264` | 23 | mi-tienda/page.jsx (6), wallet/page.jsx (3), calendar/page.jsx (2) |
| `#9CA3AF` | 21 | mis-carritos-merge/page.jsx (6), api/webhooks/shopify/route.js (5), api/protocolo-pdf/route.js (4) |
| `#F4FAFB` | 16 | armador-carritos/page.jsx (8), mis-protocolos/page.jsx (5), admin/consignacion/page.jsx (1) |
| `#162D60` | 13 | armador-carritos/page.jsx (7), cobro/[id]/page.jsx (2), admin/componentes/page.jsx (1) |
| `#F3F4F6` | 13 | api/protocolo-pdf/route.js (3), api/webhooks/shopify/route.js (3), components/QRPrintable.jsx (2) |
| `#0D2133` | 12 | components/LoginModal.jsx (12) |
| `#FFFFFF` | 11 | api/webhooks/shopify/route.js (6), api/crons/send-restock-emails/route.js (4), admin-datos-analytics/components/AnalyticsTable.jsx (1) |
| `#6B7280` | 8 | api/crons/send-restock-emails/route.js (4), api/webhooks/shopify/route.js (2), api/protocolo-pdf/route.js (1) |
| `#2BB9B8` | 6 | capacitaciones/page.jsx (3), admin-capacitaciones/page.jsx (2), comunidad/page.jsx (1) |
| `#2A5298` | 6 | sharecarts/page.jsx (3), admin-notificaciones/ClientesNotificaciones.jsx (1), admin-notificaciones/page.jsx (1) |
| `#7EAEC0` | 6 | mis-protocolos/page.jsx (5), armador-carritos/page.jsx (1) |
| `#F0F0F0` | 5 | mis-carritos-merge/page.jsx (3), api/crons/send-restock-emails/route.js (1), ganancias/page.jsx (1) |
| `#C8D8E0` | 5 | mis-protocolos/page.jsx (5) |
| `#F0F5F8` | 4 | armador-carritos/page.jsx (2), home/page.jsx (2) |
| `#10B981` | 4 | mis-carritos-merge/page.jsx (4) |
| `#7EB8C9` | 3 | api/crons/send-restock-emails/route.js (1), api/protocolo-pdf/route.js (1), api/webhooks/shopify/route.js (1) |
| `#F0F6F8` | 3 | mis-protocolos/page.jsx (3) |
| `#1A1A1A` | 3 | privacidad/page.jsx (1), soporte/page.jsx (1), terminos/page.jsx (1) |
| `#162D4A` | 2 | admin/protocols/page.jsx (2) |
| `#EEF2FF` | 2 | admin-badges/page.jsx (2) |
| `#7C3AED` | 2 | admin-datos-analytics/components/AnalyticsTable.jsx (1), admin-datos-analytics/page.jsx (1) |
| `#94A3B8` | 2 | api/admin/badges/route.js (2) |
| `#F9F9F9` | 2 | api/affiliate-app/verify/request/route.js (1), lib/customerAppAccount.js (1) |
| `#374151` | 2 | api/crons/send-restock-emails/route.js (1), mis-medallas/page.jsx (1) |
| `#F0F7FF` | 2 | api/crons/send-restock-emails/route.js (1), api/webhooks/shopify/route.js (1) |
| `#DBEAFE` | 2 | api/crons/send-restock-emails/route.js (1), api/webhooks/shopify/route.js (1) |
| `#F9FAFB` | 2 | api/protocolo-pdf/route.js (1), api/webhooks/shopify/route.js (1) |
| `#177A90` | 2 | armador-carritos/page.jsx (2) |
| `#1A7D94` | 2 | armador-carritos/page.jsx (2) |
| `#F5F5F5` | 2 | debug/page.jsx (2) |
| `#E2EBF0` | 2 | mis-protocolos/page.jsx (2) |
| `#2D4A5C` | 2 | mis-protocolos/page.jsx (2) |
| `#F7FBFC` | 2 | mis-protocolos/page.jsx (2) |
| `#162D40` | 2 | mis-protocolos/page.jsx (2) |
| `#FFF9E6` | 1 | admin-badges/page.jsx (1) |
| `#FFFBEB` | 1 | admin-badges/page.jsx (1) |
| `#E5E7EB` | 1 | admin-datos-analytics/components/AnalyticsTable.jsx (1) |
| `#D1D5DB` | 1 | admin-datos-analytics/components/AnalyticsTable.jsx (1) |
| `#F0F9FF` | 1 | admin-datos-analytics/components/AnalyticsTable.jsx (1) |
| `#F8FAFC` | 1 | admin-datos-analytics/components/AnalyticsTable.jsx (1) |
| `#16336A` | 1 | admin-pagos/page.jsx (1) |
| `#111827` | 1 | api/crons/send-restock-emails/route.js (1) |
| `#D1FAE5` | 1 | api/crons/send-restock-emails/route.js (1) |
| `#065F46` | 1 | api/crons/send-restock-emails/route.js (1) |
| `#4B5563` | 1 | api/webhooks/shopify/route.js (1) |
| `#25D366` | 1 | armador-carritos/page.jsx (1) |
| `#1EBE5B` | 1 | armador-carritos/page.jsx (1) |
| `#FAFAFA` | 1 | components/Header.jsx (1) |
| `#16344F` | 1 | components/LoginModal.jsx (1) |
| `#E3ECF1` | 1 | components/RutaProgreso.jsx (1) |
| `#D6D6D6` | 1 | ganancias/page.jsx (1) |
| `#EEF6F9` | 1 | home/page.jsx (1) |
| `#EAB308` | 1 | mis-medallas/page.jsx (1) |
| `#9ECEDD` | 1 | mis-protocolos/page.jsx (1) |
| `#D0ECF5` | 1 | mis-protocolos/page.jsx (1) |
| `#177F95` | 1 | mis-protocolos/page.jsx (1) |
| `#EEF8F3` | 1 | mis-protocolos/page.jsx (1) |
| `#C3E8D5` | 1 | mis-protocolos/page.jsx (1) |
| `#2D8C5C` | 1 | mis-protocolos/page.jsx (1) |
| `#2D6B4A` | 1 | mis-protocolos/page.jsx (1) |
| `#ECFDF5` | 1 | ordenes-v2/page.jsx (1) |
| `#047857` | 1 | ordenes-v2/page.jsx (1) |
| `#EFF6FF` | 1 | ordenes-v2/page.jsx (1) |
| `#1D4ED8` | 1 | ordenes-v2/page.jsx (1) |
| `#8BAEC0` | 1 | ordenes-v2/page.jsx (1) |
| `#7FD4E8` | 1 | ordenes-v2/page.jsx (1) |
| `#A8C5D2` | 1 | ordenes-v2/page.jsx (1) |

**Hex de 3 dígitos (7)**
| Valor | Usos | Archivos |
|---|---:|---|
| `#FFF` | 18 | ordenes-v2/page.jsx (8), api/protocolo-pdf/route.js (6), api/webhooks/shopify/route.js (2) |
| `#555` | 4 | components/QRPrintable.jsx (2), api/affiliate-app/verify/request/route.js (1), lib/customerAppAccount.js (1) |
| `#999` | 3 | api/affiliate-app/verify/request/route.js (1), components/QRPrintable.jsx (1), lib/customerAppAccount.js (1) |
| `#666` | 3 | privacidad/page.jsx (1), soporte/page.jsx (1), terminos/page.jsx (1) |
| `#333` | 2 | components/QRPrintable.jsx (1), ganancias/components/Chart2.jsx (1) |
| `#888` | 1 | components/QRPrintable.jsx (1) |
| `#BBB` | 1 | components/QRPrintable.jsx (1) |

**rgb()/rgba() (16)**
| Valor | Usos | Archivos |
|---|---:|---|
| `rgba(27,63,122,0.08)` | 6 | wallet/page.jsx (4), admin-datos-analytics/page.jsx (1), calendar/page.jsx (1) |
| `rgba(255,255,255,0.7)` | 3 | api/webhooks/shopify/route.js (2), api/protocolo-pdf/route.js (1) |
| `rgba(0,0,0,0.1)` | 2 | admin-datos-analytics/components/AnalyticsTable.jsx (1), globals.css (1) |
| `rgba(13,33,51,0.72)` | 2 | armador-carritos/page.jsx (1), components/tour/TourOverlay.jsx (1) |
| `rgba(27,63,122,0.2)` | 2 | components/QRPrintable.jsx (2) |
| `rgba(255,255,255,0.15)` | 2 | mis-medallas/page.jsx (2) |
| `rgba(0,0,0,0.55)` | 1 | capacitaciones/page.jsx (1) |
| `rgba(30,143,168,0.45)` | 1 | components/RutaProgreso.jsx (1) |
| `rgba(27,63,122,0.8)` | 1 | layout.js (1) |
| `rgba(255,255,255,0.55)` | 1 | mis-medallas/page.jsx (1) |
| `rgba(0,0,0,0.22)` | 1 | mis-medallas/page.jsx (1) |
| `rgba(255,255,255,0.5)` | 1 | mis-medallas/page.jsx (1) |
| `rgba(0,0,0,0.18)` | 1 | mis-medallas/page.jsx (1) |
| `rgba(13,33,51,0.08)` | 1 | ordenes-v2/page.jsx (1) |
| `rgba(30,143,168,0.18)` | 1 | ordenes-v2/page.jsx (1) |
| `rgba(0,0,0,0.4)` | 1 | wallet/page.jsx (1) |

**hsl()/hsla()**
no existe: 0 usos de hsl()/hsla() en src/

### 3.4 Clases de color con nombre de Tailwind

| Familia | Ocurrencias | Tonos más usados |
|---|---:|---|
| gray | 1165 | `gray-400` 283, `gray-100` 172, `gray-200` 146, `gray-500` 127, `gray-50` 94, `gray-600` 92, `gray-700` 79, `gray-300` 65 |
| red | 250 | `red-500` 64, `red-50` 44, `red-200` 41, `red-600` 36, `red-400` 35 |
| blue | 181 | `blue-600` 45, `blue-500` 36, `blue-50` 24, `blue-100` 22, `blue-700` 21 |
| emerald | 136 | `emerald-600` 37, `emerald-50` 25, `emerald-500` 24, `emerald-200` 18, `emerald-700` 16 |
| green | 86 | `green-600` 26, `green-700` 11, `green-500` 11 |
| amber | 71 | `amber-50` 17, `amber-200` 13, `amber-700` 12, `amber-600` 11 |
| yellow, purple, orange, indigo, teal, sky | 26, 25, 16, 3, 1, 1 | — |

También: `bg-white` 322 · `text-white` 198 · `bg-black` 14 · `text-black` 0. Uso de `orange-*`: solo `admin-datos-analytics/page.jsx:198`, `unauthorized/page.jsx:35-40` y `wallet/page.jsx:252-253`.

**Correos y PDF** (colores fuera de Tailwind): HTML con estilos en línea en `src/app/api/webhooks/shopify/route.js` y `src/app/api/crons/send-restock-emails/route.js`; PDF en `src/app/api/protocolo-pdf/route.js` (`backgroundColor: "#F7F9FB"`, `fontFamily: "Helvetica"`). No hay plantillas de correo en `src/lib/`.

---

## 4. Fuente de la interfaz

| Tema | Hecho |
|---|---|
| `next/font` | **No existe** (no se usa) |
| `<link>` a Google Fonts | **No existe** (ni en `src/app/layout.js` ni en `src/app/_document.jsx`) |
| `@font-face` | **No existe** |
| ¿Se carga alguna fuente? | **No.** Ninguna se carga en ningún archivo |
| Dónde está `font-lato` | `src/app/globals.css`, líneas 3-5: `.font-lato { font-family: 'Lato', sans-serif; }`. **Se usa en 3 lugares**, todos títulos de administración: `src/app/admin/page.jsx:228`, `src/app/admin-comunidad/page.jsx:151`, `src/app/admin-pagos/page.jsx:354` |
| ¿Se carga Lato en algún lado? | **No.** Como no se carga, esos 3 títulos caen a `sans-serif` |
| Fuente del resto de la app | **No se define ninguna.** Aplica la fuente por defecto de Tailwind v4 (`--font-sans` en `node_modules/tailwindcss/theme.css`, vía `--default-font-family`) |
| Correos | `Arial, Helvetica, sans-serif`, en línea |
| PDF | `Helvetica` (react-pdf), `src/app/api/protocolo-pdf/route.js` |

**Escala usada en `src/`** (ocurrencias): `text-sm` 586 · `text-xs` 432 · `text-lg` 46 · `text-2xl` 39 · `text-3xl` 35 · `text-xl` 33 · `text-base` 21 · `text-4xl` 11 · `text-5xl` 2 · `text-[10px]` 157 · `text-[11px]` 100 · `text-[9px]` 9 · `text-[13px]` 9. Pesos: `font-semibold` 312 · `font-bold` 230 · `font-extrabold` 192 · `font-medium` 150 · `font-normal` 15. Además: `uppercase` 147 · `tracking-widest` 131 · `tabular-nums` 90.

---

## 5. Componentes UI reutilizables

**Componentes compartidos que existen** (carpeta `src/app/components/`):

| Elemento pedido | Existe | Ruta |
|---|---|---|
| **Sidebar** | Sí | `src/app/components/Sidebar.jsx` (365 líneas; usado en `layout.js`) |
| **Header** | Sí | `src/app/components/Header.jsx` (55 líneas; usado en `layout.js`) |
| **Stepper** | Sí | `src/app/components/RutaProgreso.jsx` (83 líneas; solo en `home/page.jsx`) |
| **Modal** | Parcial: solo el de acceso | `src/app/components/LoginModal.jsx`. Los demás modales (18 capas `fixed inset-0`) están escritos en cada página, por ejemplo `src/app/admin/protocols/page.jsx:30` (`ProductPreviewModal`) |
| **Botón** | **No existe** | 329 `<button` escritos a mano. Ejemplo: `src/app/cobro/[id]/page.jsx:323` |
| **Input** | **No existe** | 98 `<input`, 17 `<select`, 15 `<textarea` a mano. Ejemplo: `src/app/admin/consignacion/page.jsx:218` |
| **Card** | **No existe** | Patrón repetido en línea. Ejemplo: `src/app/admin/consignacion/page.jsx:192` (`bg-white border border-[#D0E4EC] rounded-2xl p-5`) |
| **Badge** | **No existe** | Patrón repetido (42 líneas con `px-2 py-0.5`). Ejemplo: `src/app/armador-carritos/page.jsx:1354` |
| **Chip** | **No existe** | Patrón repetido con `rounded-full`. Ejemplo: `src/app/admin/consignacion/page.jsx:339` |
| **Tabs** | **No existe** | Se arman en línea. Ejemplo: `src/app/armador-carritos/page.jsx:2691` (`border-b-2`) |
| **Toast** | **No existe** | Cada página arma el suyo: 12 archivos con estado propio (`setMessage` 16, `setToast` 15, `setFeedback` 14, `setAviso` 7). Ejemplo: `src/app/mi-tienda/page.jsx:522` (`fixed bottom-5 right-5 … animate-fade-in`) |

**Otros componentes de `src/app/components/`:** `PageHeader.jsx` (31 líneas, 4 usos), `BackButton.jsx` (38, 1 uso), `CartRow.jsx` (103, 2 usos), `RequireTag.jsx` (29, 1 uso), `QRPrintable.jsx` (362, 1 uso), `AvisoPlataforma.jsx` (34, 1 uso: `wallet/page.jsx`; hoy apagado con `activo: false`), `tour/TourOverlay.jsx`. **Sin ningún import:** `Banner.jsx` (78 líneas) y `SetCustomerId.jsx` (24).

**Variantes de botón que se repiten** (líneas con el patrón; aproximado): primario azul (`bg-[#1b3f7a]` + `text-white`) 77 · primario turquesa (`bg-[#1E8FA8]` + `text-white`) 20 · peligro (`bg-red-` o `text-red-`) 10 · secundario con borde (`border` + `bg-white`) 2.

**Loaders y esqueletos:** `animate-spin` 39 · `animate-pulse` 10 (todos en línea).

---

## 6. Emojis usados como ícono en la interfaz

**80 líneas en 29 archivos** (excluye `src/app/api/` y `src/lib/`, que son servidor; los emojis de títulos de notificaciones push se arman ahí). Cada entrada es archivo y línea:

| Archivo:línea | Emoji |
|---|---|
| `admin/componentes/page.jsx:228` | ✓ |
| `admin/page.jsx:142` | ✅ |
| `admin/page.jsx:146` | ❌ |
| `admin/protocols/page.jsx:614` | ✓ |
| `admin-badges/page.jsx:67` | 🥇 🥈 🥉 |
| `admin-capacitaciones/page.jsx:143` | ✅ |
| `admin-capacitaciones/page.jsx:148` | ✅ |
| `admin-capacitaciones/page.jsx:167` | ✅ |
| `admin-comunidad/page.jsx:101` | ❌ |
| `admin-comunidad/page.jsx:119` | ✅ |
| `admin-comunidad/page.jsx:120` | ✅ |
| `admin-comunidad/page.jsx:123` | ❌ |
| `admin-comunidad/page.jsx:126` | ❌ |
| `admin-datos-afiliados/affiliates/[id]/page.jsx:356` | ✅ |
| `admin-datos-afiliados/affiliates/[id]/page.jsx:360` | ✓ ✗ |
| `admin-datos-afiliados/affiliates/[id]/page.jsx:426` | 📋 |
| `admin-datos-afiliados/affiliates/[id]/page.jsx:446` | 📋 |
| `admin-datos-afiliados/affiliates/[id]/page.jsx:478` | 📋 |
| `admin-datos-afiliados/components/AffiliatesTable.jsx:68` | 👤 |
| `admin-datos-afiliados/components/AffiliatesTable.jsx:78` | 📦 |
| `admin-datos-afiliados/components/AffiliatesTable.jsx:106` | 💬 |
| `admin-datos-afiliados/page.jsx:13` | ✅ |
| `admin-datos-analytics/page.jsx:186` | ✨ |
| `admin-datos-analytics/page.jsx:187` | 📹 |
| `admin-datos-analytics/page.jsx:188` | ⚠️ |
| `admin-pagos/page.jsx:612` | 🎁 |
| `admin-pagos/page.jsx:751` | 📅 |
| `admin-pagos/page.jsx:757` | 🏪 |
| `admin-resena/page.jsx:28` | ❌ |
| `admin-resena/page.jsx:50` | ✅ |
| `admin-resena/page.jsx:52` | ❌ |
| `admin-resena/page.jsx:55` | ❌ |
| `admin-sharecarts/page.jsx:198` | ⚠️ |
| `admin-sharecarts/page.jsx:208` | ✓ |
| `admin-sharecarts/page.jsx:230` | ✓ |
| `armador-carritos/page.jsx:555` | 📋 |
| `armador-carritos/page.jsx:892` | 🌿 |
| `armador-carritos/page.jsx:1324` | ✓ |
| `armador-carritos/page.jsx:1397` | ✓ |
| `armador-carritos/page.jsx:1665` | ✓ |
| `armador-carritos/page.jsx:2042` | ✓ |
| `armador-carritos/page.jsx:2359` | 🔬 |
| `armador-carritos/page.jsx:2652` | 🔬 |
| `armador-carritos/page.jsx:2859` | ❤️ |
| `booking-dashboard/page.jsx:167` | ✕ |
| `booking-dashboard/page.jsx:186` | ✓ |
| `booking-dashboard/page.jsx:681` | 📅 |
| `calendar/page.jsx:124` | ✓ |
| `calendar/page.jsx:125` | ✗ |
| `calendar/page.jsx:180` | ✓ |
| `components/CartRow.jsx:87` | 📞 |
| `components/RequireTag.jsx:24` | 🚫 |
| `comunidad/page.jsx:131` | ✓ |
| `debug/page.jsx:18` | 🧪 |
| `debug/page.jsx:21` | 📌 |
| `debug/page.jsx:33` | 📌 |
| `ganancias/components/pointsDashboard.jsx:63` | 🏆 |
| `ganancias/components/pointsDashboard.jsx:118` | 📋 |
| `ganancias/components/pointsDashboard.jsx:179` | 💰 |
| `ganancias/components/pointsDashboard.jsx:187` | 📞 |
| `ganancias/page.jsx:62` | 👈 |
| `home/page.jsx:273` | 👋 |
| `mi-tienda/page.jsx:229` | ✅ |
| `mi-tienda/page.jsx:245` | ✅ |
| `mi-tienda/page.jsx:261` | ✅ |
| `mi-tienda/page.jsx:274` | ❌ |
| `mi-tienda/page.jsx:275` | 🎉 |
| `mi-tienda/page.jsx:319` | ✅ |
| `mis-protocolos/page.jsx:928` | ✓ |
| `page.js:37` | 💰 |
| `page.js:38` | 📅 |
| `page.js:39` | 🛒 |
| `page.js:40` | 🎓 |
| `unauthorized/page.jsx:37` | 🔒 |
| `unauthorized/page.jsx:47` | 🏪 |
| `unauthorized/page.jsx:58` | 💼 |
| `unauthorized/page.jsx:69` | ❓ |
| `vitahuber/components/VitPageClient.jsx:41` | 💊 |
| `vitahuber/components/VitPageClient.jsx:45` | 🕒 |
| `wallet/page.jsx:349` | ✦ |

La pantalla de notificaciones (`src/app/notificaciones/`) **no tiene emojis** en su código de interfaz.

---

## 7. Textos con voseo

**Hoy: 0.** Búsqueda en `src/` con la lista del brief (`gestioná`, `accedé`, `asegurate`) más 60 formas similares (imperativos con tilde final, `-ás/-és/-ís`, `-te`, `-nos`), sin distinguir mayúsculas y con fronteras de palabra para letras con tilde. Las coincidencias restantes son falsos positivos (futuros, condicionales y pasados como "quitará", "estrés", "noté").

**Se corrigieron 26 líneas el 20-oct-2026**, de las que quedan estas rutas como registro. Antes de la corrección estaban así:

| Archivo:línea | Voseo | Ahora |
|---|---|---|
| `src/app/page.js:23` | "Gestioná … accedé" | "Gestiona … accede" |
| `src/app/mis-datos/page.jsx:228` | "Asegurate" | "Asegúrate" |
| `src/app/academia-vitahub/page.jsx:48` | "Accedés" | "Accedes" |
| `src/app/soporte/page.jsx:12, 13, 18, 26` | "tenés", "podés", "Escribinos" | "tienes", "puedes", "Escríbenos" |
| `src/app/mis-datos/page.jsx:44, 68` | "iniciá", "Recargá" | "inicia", "Recarga" |
| `src/app/book/[slug]/page.jsx:165, 205` | "necesitás", "Elegí" | "necesitas", "Elige" |
| `src/app/booking-dashboard/page.jsx:110, 742, 774` | "Definí", "Intentá", "tenés … Compartí" | "Define", "Intenta", "tienes … Comparte" |
| `src/app/referral/page.jsx:20` | "necesitás" | "necesitas" |
| `src/app/terminos/page.jsx:12, 34` | "aceptás", "autorizás" | "aceptas", "autorizas" |
| `src/app/mi-tienda/page.jsx:27, 463` | "Dejá", "vos" | "Deja", "ti" |
| `src/app/ordenes/page.jsx:82` | "Seguí" | "Sigue" |
| `src/app/ordenes-v2/page.jsx:389` | "tenés" | "tienes" |
| `src/app/admin/protocols/page.jsx:277` | "buscá" | "busca" |
| `src/app/api/affiliate-app/verify/confirm/route.js:32` | "solicitá" | "solicita" |
| `src/app/api/affiliate-app/wallet/exchange/route.js:58` y `src/app/api/affiliates/wallet/exchange/route.js:67` | "Ya tenés" | "Ya tienes" |

**Fuera de este repo:** la app móvil `vitaverse-afiliados` sí tiene voseo (por ejemplo, `app/(tabs)/cobros.js`). No se revisó aquí.

**Dónde viven los textos:** escritos directamente en cada componente. **No existe** archivo de i18n, carpeta de traducciones, librería (`next-intl`, `react-i18next`) ni CMS.

---

## 8. Descripción de producto de Shopify

| Tema | Hecho |
|---|---|
| **Archivo y función donde se renderiza** | `src/app/armador-carritos/page.jsx`, función **`ProductDetailView`** (declarada en la línea 1428). Tabla nutricional: línea **1939**; texto de la descripción: línea **1971** |
| Otros lugares donde se pinta HTML con `dangerouslySetInnerHTML` | `src/app/mis-protocolos/page.jsx:127` (`ProductPreviewModal`) · `src/app/admin/protocols/page.jsx:52` (`ProductPreviewModal`) · `src/app/academia-vitahub/page.jsx:293` (`AcademiaVitahubPage`) |
| Cómo llega | `fetch('/api/product-catalog?description=<id>')` → `src/app/api/product-catalog/route.js` (~líneas 502-581) pide a Shopify `descriptionHtml` y lo devuelve **sin modificar** |
| Separación | En el cliente, con una expresión regular, la tabla (`tableHtml`) se separa del texto (`textHtml`): `armador-carritos/page.jsx:1898-1900` |
| Sanitización | **No existe.** Ninguna librería de sanitización en `src/` (`cheerio` está en `package.json` y no se usa en `src/`) |
| CSS que la estiliza (tablas) | Clases de Tailwind en el contenedor, `armador-carritos/page.jsx:~1938`: `[&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-[#D0E4EC] [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:border …` |
| CSS que la estiliza (texto) | `armador-carritos/page.jsx:1970`: `prose prose-xs max-w-none text-[#5B7A8C] leading-relaxed [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1`. **`prose` no produce estilos** (falta `@tailwindcss/typography`); los estilos reales son los de las variantes `[&_…]` |
| Hoja de estilos dedicada | **No existe.** El único CSS global es `src/app/globals.css`, que no toca este contenido |

---

## 9. Logos, favicon y banners

| Qué | Carpeta o archivo | Formatos |
|---|---|---|
| **Logos** | `public/` | `LOGO.png` (PNG, 2588 × 757, con transparencia, 39 KB) y `logosimple.png` (PNG, 1884 × 456, 15 KB). **Logo en SVG: no existe.** **Versión para fondo oscuro: no existe** |
| **Favicon** | `src/app/favicon.ico` (10 KB; Next lo sirve solo). También `src/app/favicon123.ico` (251 KB; sin referencias) | ICO |
| **Banners** | `public/BANNER.webp` (WebP, 1800 × 195), `BANNER.jpg`, `BANNER1.webp`, `BANNER2.webp`, `BANNER3.webp` | WebP y JPG. El banner activo se lee de `/api/data/banner` (`src/app/api/data/banner/route.js`), con `/BANNER.webp` de respaldo |
| **Otras imágenes** | `public/ganancias.png`, `items.png`, `ordenes.png` (PNG 161 × 154; se usan en `src/app/ganancias/page.jsx:131, 142, 153`) | PNG |
| **Plantilla de Next sin uso** | `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | SVG |
| **Cómo se cargan** | `next/image`: `components/Header.jsx:24` y `components/LoginModal.jsx:105` (`/LOGO.png`, 273 × 80). Imágenes remotas permitidas (`next.config.mjs`): `cdn.shopify.com` e `img.youtube.com` | |

---

## 10. Archivos que habría que tocar para cambiar paleta, fuente e íconos

Orden de trabajo. La columna **Estilos repetidos en línea** dice si el color está escrito a mano en cada elemento (cantidad = ocurrencias de hex / clases de color con nombre).

| # | Archivo | Para qué | Estilos repetidos en línea |
|---:|---|---|---|
| 1 | `src/app/globals.css` | Crear los tokens (no existe ninguno) y cargar la fuente | No: es centralizado, pero hoy está casi vacío |
| 2 | `src/app/layout.js` | Cargar la fuente (hoy ninguna) y corregir `lang="en"` | No |
| 3 | `src/app/components/Sidebar.jsx` | Paleta del menú, botón Ayuda (`emerald-500`) y Cerrar sesión (`red-400`); íconos | **Sí:** 13 hex / 25 clases |
| 4 | `src/app/components/Header.jsx`, `LoginModal.jsx`, `RutaProgreso.jsx`, `PageHeader.jsx`, `BackButton.jsx` | Paleta de la estructura (`LoginModal` es el único con `#0D2133`; `RutaProgreso` tiene `rgba(30,143,168,…)`) | **Sí:** 3/7, 31/1, 16/0, 1/2, 0/3 |
| 5 | `src/app/armador-carritos/page.jsx` | Pantalla principal de productos. Concentra la paleta (`#1B3F7A`, `#1E8FA8`, grises azulados) y 70 botones | **Sí, el mayor:** 513 hex / 65 clases / 3057 líneas |
| 6 | `src/app/mis-protocolos/page.jsx` | Segunda pantalla con más color (incluye `ProductPreviewModal`) | **Sí:** 203 / 14 |
| 7 | `src/app/cobro/[id]/page.jsx`, `home/page.jsx`, `admin/consignacion/page.jsx`, `admin-notificaciones/*`, `protocolos-compartidos/page.jsx`, `mi-tienda/page.jsx` | Pantallas con hex escritos en línea | **Sí:** 93/29, 74/5, 75/15, 62/6 (`ClientesNotificaciones`), 58/9, 27/73 |
| 8 | `src/app/admin/protocols/page.jsx` | Única con `#1E3A5F`; también 115 clases con nombre | **Sí:** 46 / 115 |
| 9 | Pantallas viejas con colores con nombre de Tailwind: `booking-dashboard/page.jsx` (0 hex / 162 clases), `wallet/page.jsx` (26/118), `calendar/page.jsx` (18/79), `admin-datos-analytics/page.jsx` (6/107), `book/[slug]/page.jsx` (0/67), `sharecarts/page.jsx` (14/55), `vitahuber/components/SharecartsClient.jsx` (9/64), `admin-datos-analytics/components/AnalyticsTable.jsx` (7/60) | Son de otra familia visual que las anteriores (gris, azul, esmeralda, rojo) | **Sí:** casi todo son clases con nombre |
| 10 | **Íconos:** 51 archivos importan `lucide-react` y 4 usan `react-icons/fa` (`grep -rl "lucide-react" src`). Cada uso pasa su propio `size` (10 tamaños distintos: 9 a 28 px) | Cambiar de librería toca los 55 archivos | **Sí:** el tamaño y el trazo se pasan en cada uso |
| 11 | **Emojis:** los 29 archivos de §6 | Reemplazar si se unifica el estilo de íconos | Sí: escritos en el texto de cada pantalla |
| 12 | **Correos y PDF** (no comparten nada con Tailwind): `src/app/api/webhooks/shopify/route.js`, `src/app/api/crons/send-restock-emails/route.js`, `src/app/api/protocolo-pdf/route.js` | Paleta y fuente de los correos y del PDF | Sí: estilos en línea en cadenas de texto |
| 13 | **Assets:** `public/LOGO.png`, `public/logosimple.png`, `src/app/favicon.ico` | Logo y favicon | — |

**Dónde habría que refactorizar, porque el estilo está repetido en cada elemento:**

| Qué | Cantidad | Dónde |
|---|---:|---|
| Botones | 329 | Sin componente compartido; 70 solo en `armador-carritos/page.jsx` |
| Campos de texto, selectores y áreas de texto | 98 + 17 + 15 | Sin componente compartido |
| Modales | 18 capas `fixed inset-0` | Cada uno arma su fondo, su caja y su cierre |
| Avisos emergentes | 12 archivos | Cuatro nombres de estado distintos |
| Tablas | 6 archivos a mano + 1 con ag-grid | Sin estilo común |
| Archivos con color escrito en línea | **86 de 273** | Casi todos los que pintan interfaz |

**Dependencias instaladas que no se usan** y se pueden ignorar en un cambio: `react-router-dom` y `@tanstack/react-table`.
