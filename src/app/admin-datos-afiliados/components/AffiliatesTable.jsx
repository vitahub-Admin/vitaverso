// components/AffiliatesTable.jsx
'use client';

export default function AffiliatesTable({ affiliates, meta, onEdit, onDelete }) {
  return (
    <div className="overflow-x-auto">
      {/* Resumen de resultados */}
      <div className="mb-4 text-sm text-gray-600">
        Mostrando {affiliates.length} de {meta?.pagination?.total || 0} afiliados
        {meta?.filters?.search && (
          <span> • Búsqueda: "{meta.filters.search}"</span>
        )}
      </div>
      
      <table className="min-w-full bg-white border">
        <thead>
          <tr className="bg-gray-50">
            <th className="py-3 px-4 text-left">Nombre</th>
            <th className="py-3 px-4 text-left">Email</th>
            <th className="py-3 px-4 text-left">Teléfono</th>
            <th className="py-3 px-4 text-left">Profesión</th>
            <th className="py-3 px-4 text-left">Pacientes</th>
            <th className="py-3 px-4 text-left">Estado</th>
            <th className="py-3 px-4 text-left">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {affiliates.map((affiliate) => (
            <tr key={affiliate.id} className="border-t hover:bg-gray-50">
              <td className="py-3 px-4">
                {affiliate.first_name} {affiliate.last_name}
                <div className="text-xs text-gray-500">
                  ID: {affiliate.shopify_customer_id}
                </div>
              </td>
              <td className="py-3 px-4">{affiliate.email}</td>
              <td className="py-3 px-4">{affiliate.phone}</td>
              <td className="py-3 px-4">{affiliate.profession}</td>
              <td className="py-3 px-4">{affiliate.patient_count}</td>
              <td className="py-3 px-4">
                <span className={`px-2 py-1 rounded text-xs ${
                  affiliate.status === 'active' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {affiliate.status}
                </span>
              </td>
              <td className="py-3 px-4 space-x-2">
                <button
                  onClick={() => onEdit(affiliate)}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Editar
                </button>
                <button
                  onClick={() => onDelete(affiliate)}
                  className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  {affiliate.status === 'active' ? 'Desactivar' : 'Activar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Paginación */}
      {meta?.pagination && meta.pagination.totalPages > 1 && (
        <div className="mt-4 flex justify-between items-center">
          <div>
            Página {meta.pagination.page} de {meta.pagination.totalPages}
          </div>
          <div className="space-x-2">
            <button
              disabled={!meta.pagination.hasPrevPage}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              disabled={!meta.pagination.hasNextPage}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}