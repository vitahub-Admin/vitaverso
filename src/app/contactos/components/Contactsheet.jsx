"use client";

import { useState } from "react";
import ClientDetails from "./ClientDetails";

export default function Contactsheet({ data, specialistId }) {
  const [expandedClient, setExpandedClient] = useState(null);

  const toggleClientDetails = (email) => {
    if (expandedClient === email) {
      setExpandedClient(null);
    } else {
      setExpandedClient(email);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES');
    } catch {
      return dateString;
    }
  };

  const getFullName = (contact) => {
    const firstName = contact.nombre_cliente || "";
    const lastName = contact.apellido_cliente || "";
    return `${firstName} ${lastName}`.trim() || "Cliente sin nombre";
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-6">
      <h2 className="text-xl font-bold text-center text-[#1b3f7a]">
        Lista de Contactos ({data.length} clientes)
      </h2>

      <div className="space-y-4">
        {data && data.length > 0 ? (
          data.map((contact, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              
              {/* Fila compacta */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  
                  {/* Información principal */}
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 h-10 bg-[#1b3f7a] rounded-full flex items-center justify-center text-white font-semibold">
                      {getFullName(contact).charAt(0).toUpperCase()}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 truncate">
                        {getFullName(contact)}
                      </h3>
                      <p className="text-sm text-gray-600 truncate">{contact.email_cliente}</p>
                    </div>
                  </div>

                  {/* Métricas */}
                  <div className="flex items-center gap-6 mr-6">
                    <div className="text-center">
                      <div className="font-bold text-[#1b3f7a]">{contact.cantidad_ordenes}</div>
                      <div className="text-xs text-gray-500">Carritos</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-green-600">${Number(contact.ganancia_total || 0).toFixed(2)}</div>
                      <div className="text-xs text-gray-500">Ganancia</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-gray-700 text-sm">
                        {formatDate(contact.fecha_ultima_orden_formateada)}
                      </div>
                      <div className="text-xs text-gray-500">Última</div>
                    </div>
                  </div>

                  {/* Botón */}
                  <button
                    onClick={() => toggleClientDetails(contact.email_cliente)}
                    className="px-4 py-2 bg-[#1b3f7a] text-white rounded-lg hover:bg-[#2a5298] transition-colors font-medium text-sm whitespace-nowrap"
                  >
                    {expandedClient === contact.email_cliente ? "Ocultar" : "Detalles"}
                  </button>

                </div>
              </div>

              {/* Detalles expandidos */}
              {expandedClient === contact.email_cliente && specialistId && (
                <div className="border-t border-gray-200 bg-gray-50">
                  <ClientDetails 
                    customerEmail={contact.email_cliente} 
                    specialistId={specialistId}
                  />
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500 italic bg-white rounded-lg shadow border">
            No hay contactos disponibles
          </div>
        )}
      </div>
    </div>
  );
}