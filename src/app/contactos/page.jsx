"use client";

import { useEffect, useState, useMemo } from "react";
import Cookies from "js-cookie";
import Banner from "../components/Banner";
import ContactsSheet from "./components/Contactsheet";

export default function ContactsPage() {
  const [error, setError] = useState("");
  const [contactsData, setContactsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState(null); // ✅ Cambiar a null inicial

  const fetchData = (customerId) => {
    const url = `/api/google/contacts/${customerId}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!data.success) {
          setError(data.message);
          return;
        }
        setContactsData(data.data);
        console.log('Contacts data loaded:', data.data);
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const customerIdFromCookie = Cookies.get("customerId");
    console.log('🔍 CustomerId from cookie:', customerIdFromCookie); // ✅ Agregar log
    
    if (!customerIdFromCookie) {
      setError("No hay customerId disponible");
      setLoading(false);
      return;
    }
    
    const numericCustomerId = parseInt(customerIdFromCookie);
    console.log('🔍 Numeric customerId:', numericCustomerId); // ✅ Agregar log
    
    setCustomerId(numericCustomerId); // ✅ Guardar como número
    fetchData(numericCustomerId);
  }, []);

  // Totales para cards
  const totals = useMemo(() => {
    let totalContactos = contactsData.length;
    let totalCarritos = 0;
    let gananciaTotal = 0;
  
    contactsData.forEach((item) => {
      totalCarritos += item.cantidad_carritos || 0;
      gananciaTotal += item.ganancia_total || 0;
    });
  
    return { 
      totalContactos, 
      totalCarritos,
      gananciaTotal 
    };
  }, [contactsData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-6 p-4">
        <Banner/>
        <div className="w-full bg-white shadow-md rounded-lg p-8 text-center">
          <p className="text-gray-500">Cargando contactos...</p>
        </div>
      </div>
    );
  }

  return (
  
        <div className="flex flex-col items-center gap-6 p-4">
          <Banner/>

      
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato text-center">
          Mis Contactos
        </h1>
        <p className="text-white text-center mt-2 opacity-90">
          Todos mis clientes y sus carritos compartidos
        </p>
      </div>

      {error && (
        <div className="w-full bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Error: </strong> {error}
        </div>
      )}

      {/* Cards de resumen */}
      {contactsData.length > 0 && (
  <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    <div className="bg-white rounded-lg shadow-md p-6 text-center">
      <h3 className="text-lg font-semibold text-gray-600">Total Contactos</h3>
      <p className="text-3xl font-bold text-[#1b3f7a]">{totals.totalContactos}</p>
    </div>
    <div className="bg-white rounded-lg shadow-md p-6 text-center">
      <h3 className="text-lg font-semibold text-gray-600">Total Carritos</h3>
      <p className="text-3xl font-bold text-[#1b3f7a]">{totals.totalCarritos}</p>
    </div>
    <div className="bg-white rounded-lg shadow-md p-6 text-center">
      <h3 className="text-lg font-semibold text-gray-600">Ganancia Total</h3>
      <p className="text-3xl font-bold text-green-600">${totals.gananciaTotal.toFixed(2)}</p>
    </div>
  </div>
)}
      {/* Tabla de contactos */}
      {contactsData.length > 0 && customerId ? ( // ✅ Solo renderizar si tenemos customerId
        <div className="w-full bg-white shadow-md rounded-lg p-4">
          <ContactsSheet data={contactsData} specialistId={customerId} />
        </div>
      ) : (
        !loading && (
          <div className="w-full bg-white shadow-md rounded-lg p-8 text-center">
            <p className="text-gray-500 italic">
              {error ? error : "No hay contactos disponibles"}
            </p>
          </div>
        )
      )}
    </div>
  );
}