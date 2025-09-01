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
      Cookies.set("customerId", customerId, { expires: 30 });
    }
  }, [customerId]);

  return null; // no renderiza nada
}
