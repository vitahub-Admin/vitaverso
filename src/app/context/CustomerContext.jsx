// src/app/context/CustomerContext.jsx
"use client";

import { createContext, useContext, useState, useEffect } from "react";
import Cookies from "js-cookie";

// 1. Crea el contexto PRIMERO
const CustomerContext = createContext();

// 2. Define el Provider
export function CustomerProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCustomer = async () => {
      try {
        const customerId = Cookies.get("customerId");
        
        if (!customerId) {
          console.log("❌ No customerId en cookies");
          setLoading(false);
          return;
        }

        console.log("🔍 CustomerId encontrado:", customerId);
        
        // IMPORTANTE: Cambia esta ruta según tu endpoint
        const response = await fetch('/api/shopify/customer');
        console.log("🔍 Response status:", response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log("🔍 Response data:", data);
          
          if (data.success) {
            setCustomer(data.customer);
          } else {
            console.error("❌ Error en response:", data.message);
            setCustomer(null);
          }
        } else {
          console.error("❌ HTTP Error:", response.status);
          setCustomer(null);
        }
      } catch (error) {
        console.error("❌ Error loading customer:", error);
        setCustomer(null);
      } finally {
        setLoading(false);
      }
    };

    loadCustomer();
  }, []);

  const value = {
    customer,
    loading,
    updateCustomer: setCustomer
  };

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
}

// 3. Define el hook useCustomer (¡asegúrate de exportarlo!)
export function useCustomer() {
  const context = useContext(CustomerContext);
  
  if (!context) {
    throw new Error("useCustomer must be used within CustomerProvider");
  }
  
  return context;
}

// 4. Exportación por defecto (opcional, pero útil)
// export default { CustomerProvider, useCustomer };