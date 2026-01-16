// components/AffiliatesTable.jsx
'use client';
const SHOPIFY_STORE_ID = '7798ab-86';

function shopifyCustomerUrl(id) {
  return `https://admin.shopify.com/store/${SHOPIFY_STORE_ID}/customers/${id}`;
}

function shopifyCollectionUrl(id) {
  return `https://admin.shopify.com/store/${SHOPIFY_STORE_ID}/collections/${id}`;
}

export default function AffiliatesTable({ affiliates, meta, onEdit, onDelete }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-50 text-sm">
            <th className="py-3 px-4 text-left">Afiliado</th>
            <th className="py-3 px-4 text-left">CLABE</th>
            <th className="py-3 px-4 text-left">Shopify</th>
            <th className="py-3 px-4 text-left">Estado</th>
            <th className="py-3 px-4 text-right">Acciones</th>
          </tr>
        </thead>

        <tbody>
          {affiliates.map((affiliate) => (
            <tr key={affiliate.id} className="border-t hover:bg-gray-50">

              {/* Afiliado */}
              <td className="py-3 px-4">
                <div className="font-medium">
                  {affiliate.first_name} {affiliate.last_name}
                </div>
                <div className="text-sm text-gray-500">
                  {affiliate.email}
                </div>
              </td>

              {/* CLABE */}
              <td className="py-3 px-4 font-mono text-sm">
                {affiliate.clabe_interbancaria || '—'}
              </td>

              {/* Shopify links */}
              <td className="py-3 px-4 text-sm space-y-1">
                {affiliate.shopify_customer_id && (
                  <a
                    href={shopifyCustomerUrl(affiliate.shopify_customer_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-blue-600 hover:underline"
                  >
                    👤 Cliente #{affiliate.shopify_customer_id}
                  </a>
                )}

                {affiliate.shopify_collection_id && (
                  <a
                    href={shopifyCollectionUrl(affiliate.shopify_collection_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-blue-600 hover:underline"
                  >
                    📦 Colección #{affiliate.shopify_collection_id}
                  </a>
                )}
              </td>

              {/* Estado */}
              <td className="py-3 px-4">
                <span
                  className={`px-2 py-1 rounded text-xs ${
                    affiliate.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {affiliate.status}
                </span>
              </td>

              {/* Acciones */}
              <td className="py-3 px-4 text-right space-x-2">
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
    </div>
  );
}