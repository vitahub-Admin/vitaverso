"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { 
  User, 
  ShoppingCart, 
  Phone, 
  Key, 
  Link as LinkIcon,
  Package,
  ChevronDown,
  ExternalLink,
  Calendar,
  Clock,
  Copy,
  CheckCircle
} from "lucide-react";

export default function SharecartsPage() {
  const router = useRouter();
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedToken, setCopiedToken] = useState("");

  // Obtener sharecarts del usuario actual
  useEffect(() => {
    async function getMySharecarts() {
      try {
        const customerId = Cookies.get("customerId");
        console.log("🔍 Customer ID from cookies:", customerId);
        
        if (!customerId) {
          setError("No hay customerId disponible. Por favor inicia sesión.");
          setLoading(false);
          return;
        }

        // ✅ CORRECTO: Solo endpoint, sin parámetros
        const res = await fetch("https://pro.vitahub.mx/api/sharecart", {
          method: "GET",
          credentials: "include", // Esto envía las cookies automáticamente
          headers: {
            "Content-Type": "application/json",
          },
        });

        console.log("📡 Response status:", res.status);
        
        if (!res.ok) {
          throw new Error(`Error ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        console.log("📦 API Response:", data);
        
        // Tu API devuelve { ok: true, carts: [...] } cuando hay customerId en cookies
        if (data.ok && data.carts) {
          setCarts(data.carts);
        } else if (data.ok && data.list) {
          // Si por alguna razón entra en el modo "get all", filtrar
          const myCarts = data.list.filter(cart => cart.owner_id === customerId);
          setCarts(myCarts);
        } else {
          setError(data.error || "No se pudieron obtener los sharecarts");
        }
      } catch (err) {
        console.error("❌ Error fetching sharecarts:", err);
        setError(err.message || "Error al cargar los sharecarts");
      } finally {
        setLoading(false);
      }
    }

    getMySharecarts();
  }, []);

  // ... resto del código se mantiene igual
  // Copiar token al portapapeles
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(""), 2000);
  };

  // Formatear fecha
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return "Fecha inválida";
    }
  };

  // Calcular tiempo transcurrido
  const getTimeAgo = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Justo ahora";
      if (diffMins < 60) return `Hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
      if (diffHours < 24) return `Hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
      if (diffDays < 7) return `Hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
      
      return formatDate(dateString);
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-6xl">
          {/* Header de sección */}
          <div className="w-full bg-[#1b3f7a] rounded-lg p-4 mb-6">
            <h1 className="text-3xl md:text-4xl text-white font-lato text-center">
              Mis Sharecarts
            </h1>
            <p className="text-white text-center mt-2 opacity-90">
              Cargando tus carritos compartidos...
            </p>
          </div>
          
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1b3f7a]"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-6xl">
          <div className="w-full bg-[#1b3f7a] rounded-lg p-4 mb-6">
            <h1 className="text-3xl md:text-4xl text-white font-lato text-center">
              Mis Sharecarts
            </h1>
          </div>
          
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <div className="text-red-600 font-semibold mb-2">Error</div>
            <p className="text-gray-700 mb-4">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 bg-[#1b3f7a] text-white rounded-lg hover:bg-[#2a5298] transition-colors"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      {/* Header de sección */}
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato text-center">
          Mis Sharecarts
        </h1>
        <p className="text-white text-center mt-2 opacity-90">
          {carts.length === 0 
            ? "No tienes sharecarts creados" 
            : `${carts.length} carrito${carts.length !== 1 ? 's' : ''} compartido${carts.length !== 1 ? 's' : ''}`
          }
        </p>
      </div>

      {carts.length === 0 ? (
        <div className="text-center py-12 px-8 bg-white rounded-lg shadow border max-w-md">
          <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            No hay sharecarts
          </h3>
          <p className="text-gray-500 mb-6">
            Cuando crees carritos compartidos, aparecerán aquí.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-[#1b3f7a] text-white rounded-lg hover:bg-[#2a5298] transition-colors font-medium"
          >
            Ir al inicio
          </button>
        </div>
      ) : (
        <div className="w-full max-w-6xl space-y-6">
          {/* Resumen */}
          <div className="bg-white rounded-lg shadow border p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <User className="w-6 h-6 text-[#1b3f7a]" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Tus Carritos Compartidos</h2>
                  <p className="text-sm text-gray-600">
                    Carritos activos: {carts.filter(c => new Date(c.updated_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <div className="text-gray-600">Total</div>
                  <div className="text-xl font-bold text-[#1b3f7a]">{carts.length}</div>
                </div>
                <div className="h-8 w-px bg-gray-300"></div>
                <div className="text-center">
                  <div className="text-gray-600">Último 7 días</div>
                  <div className="text-xl font-bold text-green-600">
                    {carts.filter(c => new Date(c.updated_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lista de carritos */}
          <div className="space-y-4">
            {carts.map((cart) => (
              <details 
                key={cart.id} 
                className="group cursor-pointer bg-white rounded-lg shadow border hover:border-[#1b3f7a]/30 transition-all"
              >
                <summary className="list-none">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="w-5 h-5 text-[#1b3f7a]" />
                          <h3 className="font-semibold text-gray-800 truncate">
                            {cart.name || `Carrito ${cart.token.substring(0, 8)}`}
                          </h3>
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                            {cart.items?.length || 0} items
                          </span>
                        </div>
                        
                        {cart.phone && (
                          <div className="flex items-center gap-2 text-gray-600 text-sm">
                            <Phone className="w-4 h-4" />
                            <span className="truncate">{cart.phone}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Creado: {formatDate(cart.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Actualizado: {getTimeAgo(cart.updated_at)}
                        </span>
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
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                            <Key className="w-4 h-4" />
                            Token de acceso
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm bg-gray-100 px-3 py-2 rounded font-mono text-gray-800 truncate">
                              {cart.token}
                            </code>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                copyToClipboard(cart.token);
                              }}
                              className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                              title="Copiar token"
                            >
                              {copiedToken === cart.token ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-600" />
                              )}
                            </button>
                          </div>
                        </div>
                        
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                            <LinkIcon className="w-4 h-4" />
                            Enlace directo
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              className="flex-1 text-sm text-blue-600 hover:text-blue-800 underline truncate"
                              href={`https://vitahub.mx/cart?shared-cart-id=${cart.token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              https://vitahub.mx/cart?shared-cart-id={cart.token}
                            </a>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                copyToClipboard(`https://vitahub.mx/cart?shared-cart-id=${cart.token}`);
                              }}
                              className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                              title="Copiar enlace"
                            >
                              {copiedToken === `https://vitahub.mx/cart?shared-cart-id=${cart.token}` ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-600" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-700">ID interno:</span>
                          <span className="text-gray-600">{cart.id}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-700">Creado:</span>
                          <span className="text-gray-600">{formatDate(cart.created_at)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-700">Actualizado:</span>
                          <span className="text-gray-600">{formatDate(cart.updated_at)}</span>
                        </div>
                        {cart.location && Object.keys(cart.location).length > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-700">Ubicación:</span>
                            <span className="text-gray-600">
                              {cart.location.latitude ? `${cart.location.latitude.toFixed(4)}, ${cart.location.longitude.toFixed(4)}` : "No especificada"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Detalles de productos */}
                    {cart.extra?.products_detail?.length > 0 ? (
                      <div className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center gap-2 mb-3">
                          <Package className="w-5 h-5 text-gray-600" />
                          <h4 className="font-medium text-gray-700">
                            Productos en el carrito ({cart.extra.products_detail.length})
                          </h4>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {cart.extra.products_detail.map((p, i) => (
                            <div key={i} className="bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow">
                              <div className="space-y-2">
                                <p className="font-medium text-gray-800 text-sm line-clamp-2">
                                  {p.product_title}
                                </p>
                                <p className="text-xs text-gray-600">
                                  {p.variant_title}
                                </p>
                                <div className="flex items-center justify-between pt-2">
                                  <span className="text-xs text-gray-500">Cantidad:</span>
                                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                                    {p.quantity}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : cart.items?.length > 0 ? (
                      <div className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center gap-2 mb-3">
                          <Package className="w-5 h-5 text-gray-600" />
                          <h4 className="font-medium text-gray-700">
                            Items en el carrito ({cart.items.length})
                          </h4>
                        </div>
                        <div className="space-y-2">
                          {cart.items.map((item, i) => (
                            <div key={i} className="flex items-center justify-between bg-white p-3 rounded border">
                              <div>
                                <span className="font-medium text-gray-700">Variant ID:</span>
                                <span className="ml-2 font-mono text-sm">{item.variant_id}</span>
                              </div>
                              <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                                × {item.quantity}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}