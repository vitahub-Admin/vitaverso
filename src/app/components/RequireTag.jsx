"use client";

import { useCustomer } from "@/app/context/CustomerContext";
import { useEffect, useState } from "react";

export default function RequireTag({ tag, children }) {
  const { customer } = useCustomer();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!customer) return;

    const tags = customer.tags || [];
    const hasTag = tags.includes(tag);

    setAllowed(hasTag);
  }, [customer, tag]);

  if (!customer) return <p>Cargando usuario...</p>;

  if (!allowed)
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        🚫 No tenés permiso para ver esta página.
      </div>
    );

  return children;
}
