"use client";

import { useState, useMemo } from "react";
import {
  User,
  ShoppingCart,
  Phone,
  Key,
  Link as LinkIcon,
  Package,
  ChevronDown,
  ExternalLink,
  Search,
} from "lucide-react";

export default function SharecartsClient({ carts = [] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return carts;
    return carts.filter(
      (c) =>
        c.token?.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.owner_id?.toString().toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
    );
  }, [carts, query]);

  const grouped = useMemo(() =>
    filtered.reduce((acc, cart) => {
      const key = cart.owner_id || "NO_OWNER";
      if (!acc[key]) acc[key] = [];
      acc[key].push(cart);
      return acc;
    }, {}),
    [filtered]
  );

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      {/* Header */}
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 mb-2">
        <h1 className="text-3xl md:text-4xl text-white font-lato text-center">
          Sharecarts por Owner
        </h1>
        <p className="text-white text-center mt-2 opacity-90">
          Total: {carts.length} carritos • Mostrando: {filtered.length} • Owners: {Object.keys(grouped).length}
        </p>
      </div>

      {/* Buscador */}
      <div className="w-full max-w-6xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por token, nombre, owner ID o teléfono..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]"
        />
      </div>

      {/* Lista */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-white rounded-lg shadow p-8">
          <p className="text-lg">No se encontraron carritos</p>
        </div>
      ) : (
        <div className="w-full max-w-6xl space-y-6">
          {Object.entries(grouped).map(([owner, ownerCarts]) => (
            <div key={owner} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <div className="p-4 bg-blue-50 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <User className="w-6 h-6 text-[#1b3f7a]" />
                  <div>
                    <h2 className="text-xl font-semibold text-[#1b3f7a]">
                      {owner === "NO_OWNER" ? "Sin Owner" : `Owner: ${owner}`}
                    </h2>
                    <span className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                      <ShoppingCart className="w-4 h-4" />
                      {ownerCarts.length} carrito{ownerCarts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>

              <div className="divide-y">
                {ownerCarts.map((cart) => (
                  <details key={cart.id} className="group cursor-pointer hover:bg-gray-50 transition-colors">
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
                            {cart.created_at && (
                              <>
                                <span className="mx-2">•</span>
                                <span>{new Date(cart.created_at).toLocaleDateString("es-MX")}</span>
                              </>
                            )}
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

                    <div className="px-4 pb-4 pt-2 border-t">
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <Key className="w-4 h-4 text-gray-500" />
                              <span className="font-medium">Token completo:</span>
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">{cart.token}</code>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <LinkIcon className="w-4 h-4 text-gray-500" />
                              <span className="font-medium">Enlace:</span>
                              <a
                                className="text-blue-600 hover:text-blue-800 underline text-xs truncate"
                                href={`https://vitahub.mx/cart?shared-cart-id=${cart.token}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                ...{cart.token.substring(0, 12)}...
                              </a>
                            </div>
                          </div>
                          <div className="text-sm text-gray-600">
                            <p><span className="font-medium">ID:</span> {cart.id}</p>
                            {cart.created_at && (
                              <p><span className="font-medium">Creado:</span> {new Date(cart.created_at).toLocaleDateString("es-MX")}</p>
                            )}
                          </div>
                        </div>

                        {cart.extra?.products_detail?.length > 0 && (
                          <div className="border rounded-lg p-4 bg-gray-50">
                            <div className="flex items-center gap-2 mb-3">
                              <Package className="w-5 h-5 text-gray-600" />
                              <h4 className="font-medium text-gray-700">
                                Productos ({cart.extra.products_detail.length})
                              </h4>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {cart.extra.products_detail.map((p, i) => (
                                <div key={i} className="bg-white border rounded-lg p-3">
                                  <div className="block sm:flex sm:items-start sm:justify-between">
                                    <div className="mb-2 sm:mb-0">
                                      <p className="font-medium text-gray-800 text-sm">{p.product_title}</p>
                                      <p className="text-xs text-gray-600 mt-1">{p.variant_title}</p>
                                    </div>
                                    <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium self-start">
                                      x{p.quantity}
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
