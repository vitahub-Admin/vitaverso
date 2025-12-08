import React from "react";
import { 
  User, 
  ShoppingCart, 
  Phone, 
  Key, 
  Link as LinkIcon,
  Package,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from "lucide-react";

async function getSharecarts() {
  const res = await fetch("https://pro.vitahub.mx/api/sharecart", {
    headers: {
      "x-api-key": process.env.SHARECART_API_KEY,
    },
    cache: "no-store",
  });

  const data = await res.json();
  return data.list || [];
}

export default async function SharecartsPage() {
  const carts = await getSharecarts();

  // Agrupar los carritos por owner_id
  const grouped = carts.reduce((acc, cart) => {
    const key = cart.owner_id || "NO_OWNER";
    if (!acc[key]) acc[key] = [];
    acc[key].push(cart);
    return acc;
  }, {});

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      {/* Header de sección */}
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato text-center">
          Sharecarts por Owner
        </h1>
        <p className="text-white text-center mt-2 opacity-90">
          Total de carritos: {carts.length} • Owners: {Object.keys(grouped).length}
        </p>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-white rounded-lg shadow p-8">
          <p className="text-lg">No se encontraron sharecarts</p>
        </div>
      ) : (
        <div className="w-full max-w-6xl space-y-6">
          {Object.entries(grouped).map(([owner, ownerCarts]) => (
            <div key={owner} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              {/* Header del owner */}
              <div className="p-4 bg-blue-50 border-b border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <User className="w-6 h-6 text-[#1b3f7a]" />
                      <div>
                        <h2 className="text-xl font-semibold text-[#1b3f7a]">
                          {owner === "NO_OWNER" ? "Sin Owner" : `Owner: ${owner}`}
                        </h2>
                        <div className="text-sm text-gray-600 mt-1">
                          <span className="flex items-center gap-1">
                            <ShoppingCart className="w-4 h-4" />
                            {ownerCarts.length} carrito{ownerCarts.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lista de carritos del owner - formato acordeón */}
              <div className="divide-y">
                {ownerCarts.map((cart) => (
                  <details 
                    key={cart.id} 
                    className="group cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <summary className="list-none">
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <div className="flex items-center gap-2">
                              <ShoppingCart className="w-5 h-5 text-gray-600" />
                              <h3 className="font-medium text-gray-800">
                                {cart.name || `Carrito ${cart.id}`}
                              </h3>
                            </div>
                            
                            {cart.phone && (
                              <div className="flex items-center gap-2 text-gray-600 text-sm">
                                <Phone className="w-4 h-4" />
                                <span>{cart.phone}</span>
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            <span>ID: {cart.id}</span>
                            <span className="mx-2">•</span>
                            <span>Token: {cart.token.substring(0, 8)}...</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <a
                            className="px-3 py-1.5 bg-[#1b3f7a] text-white rounded-lg hover:bg-[#2a5298] transition-colors text-sm flex items-center gap-1"
                            href={`https://vitahub.mx/cart?shared-cart-id=${cart.token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span className="hidden sm:inline">Abrir</span>
                          </a>
                          
                          <div className="text-gray-400 group-open:rotate-180 transition-transform">
                            <ChevronDown className="w-5 h-5" />
                          </div>
                        </div>
                      </div>
                    </summary>

                    {/* Contenido expandido del acordeón */}
                    <div className="px-4 pb-4 pt-2 border-t">
                      <div className="space-y-4">
                        {/* Información del carrito */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <Key className="w-4 h-4 text-gray-500" />
                              <span className="font-medium">Token completo:</span>
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                                {cart.token}
                              </code>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <LinkIcon className="w-4 h-4 text-gray-500" />
                              <span className="font-medium">Enlace directo:</span>
                              <a
                                className="text-blue-600 hover:text-blue-800 underline text-xs truncate"
                                href={`https://vitahub.mx/cart?shared-cart-id=${cart.token}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                https://vitahub.mx/cart?shared-cart-id={cart.token.substring(0, 12)}...
                              </a>
                            </div>
                          </div>
                          
                          <div className="text-sm text-gray-600">
                            <p><span className="font-medium">ID del carrito:</span> {cart.id}</p>
                            {cart.created_at && (
                              <p><span className="font-medium">Creado:</span> {new Date(cart.created_at).toLocaleDateString('es-MX')}</p>
                            )}
                          </div>
                        </div>

                        {/* Detalles de productos */}
                        {cart.extra?.products_detail?.length > 0 && (
                          <div className="border rounded-lg p-4 bg-gray-50">
                            <div className="flex items-center gap-2 mb-3">
                              <Package className="w-5 h-5 text-gray-600" />
                              <h4 className="font-medium text-gray-700">
                                Detalles de Productos ({cart.extra.products_detail.length})
                              </h4>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {cart.extra.products_detail.map((p, i) => (
                                <div key={i} className="bg-white border rounded-lg p-3">
                                  {/* Layout para mobile: nombre arriba, cantidad abajo */}
                                  <div className="block sm:flex sm:items-start sm:justify-between">
                                    <div className="mb-2 sm:mb-0">
                                      <p className="font-medium text-gray-800 text-sm">
                                        {p.product_title}
                                      </p>
                                      <p className="text-xs text-gray-600 mt-1">
                                        {p.variant_title}
                                      </p>
                                    </div>
                                    <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium self-start">
                                      Cantidad: {p.quantity}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}