/**
 * Encabezado estándar de página.
 *
 * Hasta ahora era una convención copiada a mano en cada página, así que las
 * nuevas se iban desviando. Acá vive una sola vez: cualquier cambio de tipografía
 * o color se hace en este archivo y alcanza a todas.
 *
 *   <PageHeader title="Mi Tienda" subtitle="Gestiona tu espacio en VitaHub" />
 *
 * `children` se alinea a la derecha, para acciones como un botón de refrescar.
 * `dataTour` expone el ancla del tour cuando la página es parte del recorrido.
 */

export default function PageHeader({ title, subtitle, children, dataTour }) {
  return (
    <div className="w-full border-b border-gray-100 bg-white px-6">
      <div data-tour={dataTour}
        className="max-w-[960px] mx-auto py-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-gray-400 font-medium">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
