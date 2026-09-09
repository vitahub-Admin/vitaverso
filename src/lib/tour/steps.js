/**
 * Definición del tour de bienvenida.
 *
 * Cada paso apunta a un elemento real vía `data-tour="<target>"`, nunca por
 * clase CSS: las clases cambian con cualquier retoque de estilo y el tour se
 * rompería en silencio. El atributo es explícito y se encuentra con un grep.
 *
 * `path` es la ruta donde vive el elemento. Cuando el paso siguiente está en
 * otra ruta, el motor navega y retoma solo. `query` es opcional y sirve para
 * dejar la página en el estado que el paso necesita.
 *
 * Si un target no aparece, el motor avanza al siguiente en vez de colgarse
 * (ver TourContext). Un paso roto nunca deja al usuario encerrado.
 */

export const TOUR_ID = "bienvenida-v1";

export const TOUR_STEPS = [
  // ── 1. Datos personales ─────────────────────────────────────────────────
  {
    id: "datos-intro",
    path: "/mis-datos",
    target: "datos-form",
    title: "Empecemos por tus datos",
    body: "Aquí viven los datos con los que te identificamos y te pagamos. Revísalos una vez y no tienes que volver.",
    placement: "bottom",
  },
  {
    id: "datos-clabe",
    path: "/mis-datos",
    target: "datos-clabe",
    title: "Tu CLABE es lo más importante",
    body: "No se pide durante el registro, así que suele quedar vacía. Sin CLABE no podemos depositarte las comisiones que generes.",
    placement: "bottom",
  },

  // ── 2. Armado de protocolos ─────────────────────────────────────────────
  // Estos pasos abren una colección por query (`?tab=`) porque el armador
  // arranca en la vista home, sin grilla: sin productos en pantalla los pasos
  // de producto y comisión no tendrían a qué apuntar.
  {
    id: "protocolo-intro",
    path: "/armador-carritos",
    query: "tab=vitaminas",
    target: "buscador",
    title: "Aquí armas los protocolos",
    body: "Busca por nombre de producto, o describe el caso de tu paciente y deja que la búsqueda con IA te sugiera ingredientes.",
    placement: "bottom",
  },
  {
    id: "protocolo-ia",
    path: "/armador-carritos",
    query: "tab=vitaminas",
    target: "buscador-ia",
    title: "Búsqueda con IA",
    body: "Escribe algo como “mujer de 45 con fatiga y caída de cabello” y te devuelve los ingredientes relevantes con los productos que los contienen.",
    placement: "bottom",
  },
  {
    id: "protocolo-agregar",
    path: "/armador-carritos",
    query: "tab=vitaminas",
    target: "producto-card",
    title: "Suma productos al protocolo",
    body: "Con “+ Agregar” lo sumas directo. Si entras al producto puedes elegir presentación y ajustar la cantidad antes de agregarlo.",
    placement: "right",
  },
  {
    id: "protocolo-comision",
    path: "/armador-carritos",
    query: "tab=vitaminas",
    target: "comision-badge",
    title: "Tu comisión, siempre a la vista",
    body: "Cada producto muestra el porcentaje que ganas. En el panel del protocolo ves el total acumulado antes de enviarlo.",
    placement: "right",
  },

  // ── 3. Tu tienda ────────────────────────────────────────────────────────
  {
    id: "tienda-intro",
    path: "/mi-tienda",
    target: "tienda-header",
    title: "Tu tienda también vende por ti",
    body: "Si un paciente entra a tu tienda y compra cualquier producto, la comisión te llega igual que si se lo hubieras prescrito en un protocolo.",
    placement: "bottom",
  },
  {
    id: "tienda-imagen",
    path: "/mi-tienda",
    target: "tienda-imagen",
    title: "Pon tu imagen",
    body: "Una tienda con foto y presentación propia genera mucha más confianza que una vacía. Es lo primero que ve tu paciente.",
    placement: "bottom",
  },
  {
    id: "tienda-descripcion",
    path: "/mi-tienda",
    target: "tienda-descripcion",
    title: "Cuenta quién eres",
    body: "Una descripción corta con tu especialidad y tu enfoque alcanza. Es tu carta de presentación.",
    placement: "top",
  },

  // ── 4. Wallet ───────────────────────────────────────────────────────────
  {
    id: "wallet-acceso",
    path: "/home",
    target: "wallet-card",
    title: "Desde aquí entras a tu wallet",
    body: "Este es el acceso a tu dinero. Está en el inicio, no en el menú lateral.",
    placement: "bottom",
  },
  {
    id: "wallet-saldo",
    path: "/wallet",
    target: "wallet-saldo",
    title: "Tu saldo disponible",
    body: "Aquí se acumulan las comisiones confirmadas de tus ventas.",
    placement: "bottom",
  },
  {
    id: "wallet-historial",
    path: "/wallet",
    target: "wallet-historial",
    title: "El historial de movimientos",
    body: "Cada comisión que entra y cada canje que haces queda registrado aquí.",
    placement: "top",
  },
  {
    id: "wallet-app",
    path: "/wallet",
    target: "wallet-app",
    title: "Descarga la app",
    body: "Próximamente los retiros de dinero y las notificaciones van a funcionar solo desde la app. Conviene tenerla instalada desde ahora.",
    placement: "top",
  },
];
