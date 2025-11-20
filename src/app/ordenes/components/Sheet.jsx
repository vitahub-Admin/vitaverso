"use client";

import { useState } from "react";
import { FaWhatsapp } from "react-icons/fa";

export default function OrdersTable({ data }) {
  const [expandedOrder, setExpandedOrder] = useState(null);

  const toggleOrderDetails = (orderNumber) => {
    if (expandedOrder === orderNumber) {
      setExpandedOrder(null);
    } else {
      setExpandedOrder(orderNumber);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount || 0);
  };

  // Función para formatear fecha (igual que en ClientDetails)
  const formatDate = (dateObj) => {
    if (!dateObj || !dateObj.value) return "N/A";
    try {
      const date = new Date(dateObj.value);
      return date.toLocaleDateString('es-ES');
    } catch {
      return "Fecha inválida";
    }
  };

  // Función para calcular fecha de terminación (igual que en ClientDetails)
  const calculateEndDate = (startDate, duration) => {
    if (!startDate || !startDate.value || !duration) return "N/A";
    
    try {
      const start = new Date(startDate.value);
      const daysMatch = duration.match(/(\d+)/);
      
      let days = 30;
      if (daysMatch) days = parseInt(daysMatch[1]);
      
      const endDate = new Date(start);
      endDate.setDate(start.getDate() + days);
      
      return endDate.toLocaleDateString('es-ES');
    } catch {
      return "Cálculo inválido";
    }
  };

  // Función para verificar inventario
  const hasInventory = (producto) => {
    return producto.inventario > 0;
  };

  // Función para compartir por WhatsApp
  const shareProduct = (productName, productHandle) => {
    const customerId = localStorage.getItem("customerId") || "default";
    const productUrl = `https://vitahub.mx/products/${productHandle}?sref=${customerId}`;
    const message = `Hola! Noté que se te está por terminar el "${productName}". Te comparto el link para que lo puedas reponer: ${productUrl}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="space-y-4">
      {data.map((order) => (
        <div key={order.order_number} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          
          {/* Header de la orden */}
          <div className="p-4 bg-blue-50 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              
              {/* Información básica */}
              <div className="flex-1">
                <div className="flex items-center gap-4 flex-wrap">
                  <h3 className="text-lg font-semibold text-[#1b3f7a]">
                    Orden #{order.order_number}
                  </h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    order.financial_status === 'paid' ? 'bg-green-100 text-green-800' :
                    order.financial_status === 'refunded' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {order.financial_status || 'unknown'}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  <span>
                    Cliente: {order.nombre_cliente} {order.apellido_cliente || ''}
                  </span>
                  <span className="mx-2">•</span>
                  <span>Fecha: {formatDate(order.created_at)}</span> {/* ✅ USAR formatDate */}
                  <span className="mx-2">•</span>
                  <span>Items: {order.total_items}</span>
                </div>
              </div>

              {/* Métricas y botón */}
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-gray-600">Ganancia Total</div>
                  <div className="text-lg font-bold text-green-600">
                    {formatCurrency(order.ganancia_total)}
                  </div>
                </div>
                <button
                  onClick={() => toggleOrderDetails(order.order_number)}
                  className="px-4 py-2 bg-[#1b3f7a] text-white rounded-lg hover:bg-[#2a5298] transition-colors text-sm"
                >
                  {expandedOrder === order.order_number ? "Ocultar" : "Ver Detalles"}
                </button>
              </div>
            </div>
          </div>

          {/* Detalles expandidos */}
          {expandedOrder === order.order_number && (
            <div className="p-4 bg-gray-50">
              <div className="mb-4">
                <h4 className="font-semibold text-gray-700 mb-2">Información de Contacto</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Nombre completo:</span> {order.nombre_cliente} {order.apellido_cliente || ''}
                  </div>
                  <div>
                    <span className="font-medium">Email:</span> {order.customer_email}
                  </div>
                </div>
              </div>

              <h4 className="font-semibold text-gray-700 mb-3">Productos</h4>
              
              {/* Header de la tabla de productos */}
              <div className="grid grid-cols-12 gap-2 text-sm font-medium text-gray-600 border-b pb-2 mb-3">
                <div className="col-span-5">Producto</div>
                <div className="col-span-2 text-center">Cantidad</div>
                <div className="col-span-2 text-center">Ganancia</div>
                <div className="col-span-2 text-center">Termina</div>
                <div className="col-span-1 text-center">Acción</div>
              </div>

              {/* Lista de productos */}
              <div className="space-y-3">
                {order.productos.map((producto, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 text-sm items-center p-3 bg-white rounded border">
                    
                    {/* Producto */}
                    <div className="col-span-5 font-medium text-gray-800">
                      {producto.producto}
                    </div>
                    
                    {/* Cantidad */}
                    <div className="col-span-2 text-center">
                      {producto.cantidad || 0}
                    </div>
                    
                    {/* Ganancia */}
                    <div className="col-span-2 text-center font-semibold text-green-600">
                      {formatCurrency(producto.ganancia_producto)}
                    </div>
                    
                    {/* Termina */}
                    <div className="col-span-2 text-center text-blue-600">
                      {calculateEndDate(order.created_at, producto.duracion)} {/* ✅ USAR order.created_at */}
                    </div>
                    
                    {/* Acción */}
                    <div className="col-span-1 text-center">
                      {producto.product_handle ? (
                        hasInventory(producto) ? (
                          <button
                            onClick={() => shareProduct(producto.producto, producto.product_handle)}
                            className="flex items-center justify-center gap-1 px-2 py-1 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors text-xs"
                            title={`Compartir por WhatsApp (Stock: ${producto.inventario})`}
                          >
                            <FaWhatsapp className="text-xs" />
                          </button>
                        ) : (
                          <div 
                            className="flex items-center justify-center gap-1 px-2 py-1 bg-gray-400 text-white rounded-full cursor-not-allowed text-xs"
                            title="Sin stock disponible"
                          >
                            <span>Sin Stock</span>
                          </div>
                        )
                      ) : (
                        <div 
                          className="flex items-center justify-center gap-1 px-2 py-1 bg-gray-300 text-white rounded-full cursor-not-allowed text-xs"
                          title="Información incompleta"
                        >
                          <span>Sin Info</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}