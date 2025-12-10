// app/components/FusionCartsPage.jsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { 
  User, 
  ShoppingCart, 
  Phone, 
  Package,
  ChevronDown,
  ExternalLink,
  Calendar,
  Clock,
  CheckCircle,
  DollarSign,
  Eye,
  AlertCircle
} from "lucide-react";

export default function FusionCartsPage() {
  const router = useRouter();
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedToken, setCopiedToken] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");

  // Función para extraer valores de objetos BigQuery (igual que en Sheet)
  const extractValue = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object' && 'value' in value) {
      return value.value;
    }
    return value;
  };

  // Obtener sharecarts fusionados
  useEffect(() => {
    async function getFusionCarts() {
      try {
        const customerId = Cookies.get("customerId");
        console.log("🔍 Customer ID from cookies:", customerId);
        
        if (!customerId) {
          setError("No hay customerId disponible. Por favor inicia sesión.");
          setLoading(false);
          return;
        }

        // 1. Obtener datos fusionados del nuevo endpoint
        const fusionResponse = await fetch(`/api/sharecart/merged/${customerId}`);
        const fusionData = await fusionResponse.json();
        
        console.log("📦 Datos fusionados crudos:", fusionData);

        if (!fusionData.success) {
          throw new Error(fusionData.error || "Error obteniendo datos fusionados");
        }

        // 2. Transformar datos usando la misma lógica que Sheet
        // En la transformación de carts (dentro de useEffect):
const transformedCarts = fusionData.data.map(cart => {
  // Extraer todos los valores como en Sheet
  const getVal = (key) => extractValue(cart[key]);
  
  // Determinar tipo de carrito
  const cartSource = getVal('source');
  const cartType = cartSource === 'bigquery' ? "legacy" : "new";
  
  // Determinar status (igual que Sheet)
  const rawStatus = getVal('status');
  let status = "pending";
  let statusLabel = "⏳ Pendiente";
  let statusColor = "bg-yellow-100 text-yellow-800";
  
  if (rawStatus === 'Completed' || rawStatus === 'paid' || cart.is_paid) {
    status = "completed";
    statusLabel = "✅ Completado";
    statusColor = "bg-green-100 text-green-800";
  }

  // Formatear fechas
  const formatDate = (dateStr) => {
    const dateValue = extractValue(dateStr);
    if (!dateValue) return null;
    try {
      const date = new Date(dateValue);
      return new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return String(dateValue);
    }
  };

  // Extraer fechas (igual que Sheet)
  const createdAt = getVal('created_at');
  const updatedAt = getVal('updated_at') || createdAt;

  // OBTENER NOTAS DE AMBOS SISTEMAS
  let patientNotes = "";
  
  // 1. BigQuery: note es el nombre del destinatario
  if (cartSource === 'bigquery') {
    patientNotes = getVal('note') || "";
  }
  
  // 2. Supabase: notes está dentro de extra.patient_info
  if (cartSource === 'supabase' && cart.extra?.patient_info?.notes) {
    patientNotes = cart.extra.patient_info.notes;
  }

  // También extraer otros datos del patient_info si existen
  const patientInfo = cart.extra?.patient_info || {};

  return {
    // Identificadores (extraer valores como en Sheet)
    id: getVal('id') || getVal('code') || getVal('token'),
    token: getVal('token'),
    source: cartSource,
    type: cartType,
    platform: getVal('platform'),
    
    // Datos del cliente (igual que Sheet)
    name: getVal('client_name') || getVal('name') || getVal('email') || "Sin nombre",
    email: getVal('email'),
    phone: getVal('phone'),
    
    // NOTAS DEL PACIENTE (NUEVO)
    patient_notes: patientNotes,
    patient_info: patientInfo,
    
    // Información del carrito (igual que Sheet)
    status: status,
    statusLabel: statusLabel,
    statusColor: statusColor,
    items_count: getVal('items_count') || cart.items?.length || 0,
    items_value: getVal('items_value') || null,
    opens_count: getVal('opens_count') || 0,
    order_number: getVal('order_number'),
    
    // Items detallados
    items: cart.items || cart.items_details || [],
    products_detail: cart.extra?.products_detail || [],
    
    // Metadata (extraer valores como en Sheet)
    created_at: createdAt,
    created_at_formatted: formatDate(createdAt) || "-",
    updated_at: updatedAt,
    updated_at_formatted: formatDate(updatedAt) || "-",
    
    // Datos adicionales
    extra: cart.extra || {},
    location: cart.location || {},
    supabase_data: cart.supabase_data,
    is_merged: !!cart.supabase_data || cartType === "new"
  };
});

        // Ordenar por fecha (más reciente primero)
        transformedCarts.sort((a, b) => {
          const dateA = new Date(a.created_at || 0);
          const dateB = new Date(b.created_at || 0);
          return dateB - dateA;
        });

        console.log("✅ Datos transformados:", transformedCarts);
        setCarts(transformedCarts);

      } catch (err) {
        console.error("❌ Error fetching fusion carts:", err);
        setError(err.message || "Error al cargar los carritos fusionados");
      } finally {
        setLoading(false);
      }
    }

    getFusionCarts();
  }, []);

  // Copiar token al portapapeles
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(""), 2000);
  };

  // Calcular tiempo transcurrido
  const getTimeAgo = (dateString) => {
    const dateValue = extractValue(dateString);
    if (!dateValue) return "";
    try {
      const date = new Date(dateValue);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Justo ahora";
      if (diffMins < 60) return `Hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
      if (diffHours < 24) return `Hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
      if (diffDays < 7) return `Hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
      
      return new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(date);
    } catch {
      return "";
    }
  };

  // Filtrar carritos
  const filteredCarts = carts.filter(cart => {
    switch (selectedFilter) {
      case "new":
        return cart.type === "new";
      case "legacy":
        return cart.type === "legacy";
      case "completed":
        return cart.status === "completed";
      case "pending":
        return cart.status === "pending";
      default:
        return true;
    }
  });

  // Estadísticas
  const stats = {
    total: carts.length,
    new: carts.filter(c => c.type === "new").length,
    legacy: carts.filter(c => c.type === "legacy").length,
    completed: carts.filter(c => c.status === "completed").length,
    pending: carts.filter(c => c.status === "pending").length,
    totalValue: carts.reduce((sum, c) => sum + (Number(c.items_value) || 0), 0),
    totalOpens: carts.reduce((sum, c) => sum + (Number(c.opens_count) || 0), 0)
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-6xl">
          <div className="w-full bg-gradient-to-r from-[#1b3f7a] to-[#2a5298] rounded-lg p-4 mb-6">
            <h1 className="text-3xl md:text-4xl text-white font-lato text-center">
              Carritos Compartidos Fusionados
            </h1>
            <p className="text-white text-center mt-2 opacity-90">
              Cargando todos tus carritos...
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
          <div className="w-full bg-gradient-to-r from-[#1b3f7a] to-[#2a5298] rounded-lg p-4 mb-6">
            <h1 className="text-3xl md:text-4xl text-white font-lato text-center">
              Carritos Compartidos Fusionados
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
      <div className="w-full bg-gradient-to-r from-[#1b3f7a] to-[#2a5298] rounded-lg p-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato text-center">
          Carritos Compartidos
        </h1>
        <p className="text-white text-center mt-2 opacity-90">
          {carts.length === 0 
            ? "No tienes carritos compartidos" 
            : `${carts.length} carrito${carts.length !== 1 ? 's' : ''} (${stats.new} nuevos, ${stats.legacy} Antiguo)`
          }
        </p>
      </div>

      {carts.length === 0 ? (
        <div className="text-center py-12 px-8 bg-white rounded-lg shadow border max-w-md">
          <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            No hay carritos compartidos
          </h3>
          <p className="text-gray-500 mb-6">
            Cuando crees o tengas carritos compartidos, aparecerán aquí.
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
          {/* Estadísticas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow border p-4 text-center">
              <div className="text-2xl font-bold text-[#1b3f7a]">{stats.total}</div>
              <div className="text-sm text-gray-600">Total Carritos</div>
            </div>
            <div className="bg-white rounded-lg shadow border p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-sm text-gray-600">Completados</div>
            </div>
            <div className="bg-white rounded-lg shadow border p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.new}</div>
              <div className="text-sm text-gray-600">Nuevos</div>
            </div>
            <div className="bg-white rounded-lg shadow border p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                ${stats.totalValue.toLocaleString('es-MX', {minimumFractionDigits: 2})}
              </div>
              <div className="text-sm text-gray-600">Valor Total</div>
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-lg shadow border p-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedFilter("all")}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedFilter === "all" 
                    ? "bg-[#1b3f7a] text-white" 
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Todos ({stats.total})
              </button>
              <button
                onClick={() => setSelectedFilter("new")}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedFilter === "new" 
                    ? "bg-purple-600 text-white" 
                    : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                }`}
              >
                Nuevos ({stats.new})
              </button>
              <button
                onClick={() => setSelectedFilter("legacy")}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedFilter === "legacy" 
                    ? "bg-blue-600 text-white" 
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                }`}
              >
                Antiguo ({stats.legacy})
              </button>
              <button
                onClick={() => setSelectedFilter("completed")}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedFilter === "completed" 
                    ? "bg-green-600 text-white" 
                    : "bg-green-100 text-green-700 hover:bg-green-200"
                }`}
              >
                Completados ({stats.completed})
              </button>
              <button
                onClick={() => setSelectedFilter("pending")}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedFilter === "pending" 
                    ? "bg-yellow-600 text-white" 
                    : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                }`}
              >
                Pendientes ({stats.pending})
              </button>
            </div>
          </div>

          {/* Lista de carritos */}
          <div className="space-y-4">
            {filteredCarts.map((cart) => (
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
                            {String(cart.name || `Carrito ${cart.token?.substring?.(0, 8) || ''}`)}
                          </h3>
                          <span className={`px-2 py-1 rounded-full text-xs ${cart.statusColor}`}>
                            {cart.statusLabel}
                          </span>
                          {cart.type === "legacy" && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                              Antiguo
                            </span>
                          )}
                          {cart.type === "new" && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                              Nuevo
                            </span>
                          )}
                        </div>
                        
                        {cart.phone && (
                          <div className="flex items-center gap-2 text-gray-600 text-sm">
                            <Phone className="w-4 h-4" />
                            <span className="truncate">{String(cart.phone)}</span>
                          </div>
                        )}

                        {cart.email && (
                          <div className="hidden md:flex items-center gap-2 text-gray-600 text-sm">
                            <User className="w-4 h-4" />
                            <span className="truncate">{String(cart.email)}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mt-2">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Creado: {cart.created_at_formatted || "N/A"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Actualizado: {getTimeAgo(cart.updated_at)}
                        </span>
                        
                        {cart.items_value > 0 && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            Valor: ${String(cart.items_value?.toLocaleString?.('es-MX', {minimumFractionDigits: 2}) || '0.00')}
                          </span>
                        )}
                        
                        {cart.opens_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            Aperturas: {String(cart.opens_count)}
                          </span>
                        )}
                        
                        {cart.items_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            Items: {String(cart.items_count)}
                          </span>
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

                {/* Contenido expandido del acordeón */}
                <div className="px-4 pb-4 pt-2 border-t">
                  <div className="space-y-4">
                    {/* Información del carrito */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        {/* Información del cliente */}
                        <div>
                          <div className="text-sm font-medium text-gray-700 mb-2">
                            Información del Cliente
                          </div>
                          <div className="space-y-2 text-sm">
                            {cart.name && cart.name !== "Sin nombre" && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Nombre:</span>
                                <span className="font-medium">{String(cart.name)}</span>
                              </div>
                            )}
                            
                            {cart.phone && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Teléfono:</span>
                                <span className="font-medium">{String(cart.phone)}</span>
                              </div>
                            )}
                            
                            {cart.email && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Email:</span>
                                <span className="font-medium">{String(cart.email)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Enlace directo */}
                        <div>
                          <div className="text-sm font-medium text-gray-700 mb-2">
                            Enlace para compartir
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
                                <ExternalLink className="w-4 h-4 text-gray-600" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        {/* Métricas */}
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-700">Tipo:</span>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            cart.type === "new" 
                              ? "bg-purple-100 text-purple-800" 
                              : "bg-blue-100 text-blue-800"
                          }`}>
                            {cart.type === "new" ? "Nuevo Sistema" : "Sistema Histórico"}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-700">Estado:</span>
                          <span className={`px-2 py-1 rounded-full text-xs ${cart.statusColor}`}>
                            {cart.statusLabel}
                          </span>
                        </div>
                        
                        {cart.order_number && (
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-700">Orden #:</span>
                            <span className="font-mono text-gray-600">{String(cart.order_number)}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-700">Creado:</span>
                          <span className="text-gray-600">{cart.created_at_formatted}</span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-700">Actualizado:</span>
                          <span className="text-gray-600">{cart.updated_at_formatted}</span>
                        </div>
                        
                        {cart.items_value > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-700">Valor Total:</span>
                            <span className="font-bold text-green-600">
                              ${String(cart.items_value?.toLocaleString?.('es-MX', {minimumFractionDigits: 2}) || '0.00')}
                            </span>
                          </div>
                        )}
                        
                        {cart.opens_count > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-700">Aperturas:</span>
                            <span className="flex items-center gap-1">
                              <Eye className="w-4 h-4" />
                              {String(cart.opens_count)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

<div className="space-y-4">
  {/* Información del carrito */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* ... código existente ... */}
  </div>

  {/* NOTAS DEL PACIENTE - NUEVA SECCIÓN */}
  {(cart.patient_notes || Object.keys(cart.patient_info || {}).length > 0) && (
    <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h4 className="font-medium text-gray-700">
          Notas adicionales
          {cart.type === "legacy" && (
            <span className="ml-2 text-xs text-gray-500">(Notas del carrito)</span>
          )}
        </h4>
      </div>
      
      {/* Mostrar notas principales */}
      {cart.patient_notes && (
        <div className="mb-3">
          <p className="text-sm text-gray-600 mb-1">Notas:</p>
          <div className="bg-white p-3 rounded border">
            <p className="text-gray-800 whitespace-pre-wrap">{cart.patient_notes}</p>
          </div>
        </div>
      )}

    </div>
  )}

                    {/* Items del carrito */}
                    {(cart.products_detail?.length > 0 || cart.items?.length > 0) ? (
                      <div className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center gap-2 mb-3">
                          <Package className="w-5 h-5 text-gray-600" />
                          <h4 className="font-medium text-gray-700">
                            Productos en el carrito ({cart.products_detail?.length || cart.items?.length})
                          </h4>
                        </div>
                        
                        {cart.products_detail?.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {cart.products_detail.map((p, i) => (
                              <div key={i} className="bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow">
                                <div className="space-y-2">
                                  <p className="font-medium text-gray-800 text-sm line-clamp-2">
                                    {p.product_title || "Producto sin nombre"}
                                  </p>
                                  {p.variant_title && (
                                    <p className="text-xs text-gray-600">
                                      {p.variant_title}
                                    </p>
                                  )}
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
                        ) : cart.items?.length > 0 ? (
                          <div className="space-y-2">
                            {cart.items.map((item, i) => (
                              <div key={i} className="flex items-center justify-between bg-white p-3 rounded border">
                                <div>
                                  <span className="font-medium text-gray-700">Item #{i + 1}:</span>
                                  <span className="ml-2 font-mono text-sm">
                                    {item.variant_id || "Sin ID"}
                                  </span>
                                </div>
                                <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                                  × {item.quantity || 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="border rounded-lg p-4 bg-yellow-50 border-yellow-200">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-5 h-5 text-yellow-600" />
                          <p className="text-sm text-yellow-700">
                            No hay información detallada de productos para este carrito.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
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