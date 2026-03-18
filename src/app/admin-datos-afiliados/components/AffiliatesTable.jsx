// components/AffiliatesTable.jsx
'use client';

const SHOPIFY_STORE_ID = '7798ab-86';
const VAMBE_PIPELINE_ID = 'e62197d9-4933-4ad9-87d2-64fe03166ef5';

function shopifyCustomerUrl(id) {
  return `https://admin.shopify.com/store/${SHOPIFY_STORE_ID}/customers/${id}`;
}

function shopifyCollectionUrl(id) {
  return `https://admin.shopify.com/store/${SHOPIFY_STORE_ID}/collections/${id}`;
}

function vitaPro(id) {
  return `https://pro.vitahub.mx/wallet?aId=${id}`;
}

function getVambeUrl(vambeContactId) {
  if (!vambeContactId) return null;
  return `https://app.vambeai.com/pipeline?id=${VAMBE_PIPELINE_ID}&chatContactId=${vambeContactId}`;
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
            <th className="py-3 px-4 text-left">Link ProVitahub</th>
            <th className="py-3 px-4 text-left">Vambe</th>
            <th className="py-3 px-2 text-left">Estado</th>
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

              {/* Link ProVitahub */}
              <td className="py-3 px-4 text-sm space-y-1">
                {affiliate.shopify_customer_id && (
                  <p className="block text-blue-600 hover:underline">
                    {vitaPro(affiliate.shopify_customer_id)}
                  </p>
                )}
                {affiliate.shopify_collection_id && (
                  <p className="block text-gray-600">
                    Usa el link y accede en modo incognito
                  </p>
                )}
              </td>

              {/* Vambe */}
              <td className="py-3 px-4 text-sm">
                {affiliate.vambe_contact_id ? (
                  <a
                    href={getVambeUrl(affiliate.vambe_contact_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:underline"
                  >
                    💬 Ver chat
                  </a>
                ) : (
                  <span className="text-gray-400 text-xs">Sin sincronizar</span>
                )}
              </td>

              {/* Estado */}
              <td className="py-3 px-2">
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