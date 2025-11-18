// app/components/SetCustomerId.jsx
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Cookies from "js-cookie";

export default function SetCustomerId() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId");

  useEffect(() => {
    if (customerId) {
      console.log("✅ SetCustomerId: Guardando customerId en cookies:", customerId);
      Cookies.set("customerId", customerId, { expires: 30 });
      
      // Limpiar URL sin recargar
      const url = new URL(window.location.href);
      url.searchParams.delete('customerId');
      window.history.replaceState({}, '', url.toString());
    }
  }, [customerId]);

  return null;
}