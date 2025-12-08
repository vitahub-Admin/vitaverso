"use client";

import { createContext, useContext, useState, useEffect } from "react";
import Cookies from "js-cookie";

const CustomerContext = createContext();

export function CustomerProvider({ children }) {
  const [customer, setCustomer] = useState(null);

  useEffect(() => {
    const customerId = Cookies.get("customerId");
    if (!customerId) return;

    fetch(`/api/shopify/customer/${customerId}`)
      .then(r => r.json())
      .then(data => setCustomer(data))
      .catch(() => setCustomer(null));
  }, []);

  return (
    <CustomerContext.Provider value={{ customer }}>
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  return useContext(CustomerContext);
}
