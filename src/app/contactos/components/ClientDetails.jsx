"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { FaWhatsapp, FaBoxOpen } from "react-icons/fa";

export default function ClientDetails({ customerEmail, specialistId }) {
  const [clientData, setClientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchClientDetails = async () => {
      try {
        setLoading(true);
        setError("");
        
        const url = `/api/google/client-details/${specialistId}?email=${encodeURIComponent(customerEmail)}`;
        
        const res = await fetch(url);
        
        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }
        
        const data = await res.json();
        
        if (!data.success) {
          setError(data.message);
          return;
        }
        
        setClientData(data.data);
        
      } catch (err) {
        console.error('Error fetching client details:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (customerEmail && specialistId) {
      fetchClientDetails();
    } else {
      setError("Faltan parámetros necesarios");
      setLoading(false);
    }
  }, [customerEmail, specialistId]);

  // Agrupar órdenes por order_number
  const groupedOrders = clientData ? clientData.reduce((acc, order) => {
    const orderNumber = order.order_number;
    if (!acc[orderNumber]) {
      acc[orderNumber] = [];
    }
    acc[orderNumber].push(order);
    return acc;
  }, {}) : {};

  // Función para formatear fecha
  const formatDate = (dateObj) => {
    if (!dateObj || !dateObj.value) return "N/A";
    try {
      const date = new Date(dateObj.value);
      return date.toLocaleDateString('es-ES');
    } catch {
      return "Fecha inválida";
    }
  };

  // Función para calcular fecha de terminación
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

  // Función para verificar inventario (ahora directo desde los datos)
  const hasInventory = (order) => {
    return order.inventory_quantity > 0;
  };

  // Función para compartir por WhatsApp
  const shareProduct = (productName, productHandle) => {
    const customerId = Cookies.get("customerId");
    const productUrl = `https://vitahub.mx/products/${productHandle}?sref=${customerId}`;
    const message = `Hola! Noté que se te está por terminar el "${productName}". Te comparto el link para que lo puedas reponer: ${productUrl}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
  };

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Cargando detalles...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  }

  if (!clientData || clientData.length === 0) {
    return <div className="p-4 text-center text-gray-500">No se encontraron órdenes</div>;
  }

  return (
    <div className="p-6 bg-gray-50">
      <h4 className="text-md font-semibold text-[#1b3f7a] mb-4">
        Órdenes de {customerEmail}
      </h4>
      
      <div className="space-y-6">
        {Object.entries(groupedOrders).map(([orderNumber, orders]) => {
          const firstOrder = orders[0];
          const totalGanancia = orders.reduce((sum, order) => sum + (order.ganancia_producto || 0), 0);
          
          return (
            <div key={orderNumber} className="border-2 border-[#1b3f7a] rounded-lg p-4 bg-blue-50">
              {/* Header de la orden */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-3 bg-white rounded border">
                <div>
                  <span className="font-semibold text-gray-600">Orden:</span>
                  <div className="text-lg font-bold text-[#1b3f7a]">#{orderNumber}</div>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Fecha:</span>
                  <div>{formatDate(firstOrder.created_at)}</div>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Estado:</span>
                  <div>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      firstOrder.financial_status === 'paid' ? 'bg-green-100 text-green-800' :
                      firstOrder.financial_status === 'refunded' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {firstOrder.financial_status || 'unknown'}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Ganancia Total:</span>
                  <div className="text-lg font-bold text-green-600">${totalGanancia.toFixed(2)}</div>
                </div>
              </div>
              
              {/* Productos de la orden */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-700">Productos:</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-sm font-medium text-gray-600 border-b pb-2">
                  <div className="md:col-span-5">Producto</div>
                  <div className="md:col-span-2 text-center">Cantidad</div>
                  <div className="md:col-span-2 text-center">Ganancia</div>
                  <div className="md:col-span-2 text-center">Termina</div>
                  <div className="md:col-span-1 text-center">Acción</div>
                </div>
                
                {orders.map((order, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 text-sm items-center p-3 bg-white rounded border">
                    <div className="md:col-span-5 font-medium text-gray-800">
                      {order.line_items_name}
                    </div>
                    <div className="md:col-span-2 text-center">
                      {order.line_items_quantity || 0}
                    </div>
                    <div className="md:col-span-2 text-center font-semibold text-green-600">
                      ${(order.ganancia_producto || 0).toFixed(2)}
                    </div>
                    <div className="md:col-span-2 text-center text-blue-600">
                      {calculateEndDate(order.created_at, order.duration)}
                    </div>
                    <div className="md:col-span-1 text-center">
                      {order.handle ? (
                        hasInventory(order) ? (
                          <button
                            onClick={() => shareProduct(order.line_items_name, order.handle)}
                            className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors text-xs whitespace-nowrap"
                            title={`Compartir por WhatsApp (Stock: ${order.inventory_quantity})`}
                          >
                            <FaWhatsapp className="text-xs" />
                           
                          </button>
                        ) : (
                          <div 
                            className="flex items-center gap-1 px-3 py-1 bg-gray-400 text-white rounded-full cursor-not-allowed text-xs whitespace-nowrap"
                            title="Sin stock disponible"
                          >
                        
                            <span>Sin Stock</span>
                          </div>
                        )
                      ) : (
                        <div 
                          className="flex items-center gap-1 px-3 py-1 bg-gray-300 text-white rounded-full cursor-not-allowed text-xs whitespace-nowrap"
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
          );
        })}
      </div>
    </div>
  );
}