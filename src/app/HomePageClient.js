"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function HomePageClient() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId");

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!customerId) return;

    setLoading(true);
    fetch(`/api/shopify/customer/${customerId}`)
      .then((res) => res.json())
      .then((data) => {
        setCustomer(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Error al obtener datos del cliente");
        setLoading(false);
      });
  }, [customerId]);

  if (!customerId) return null;
  if (loading) return <p>Cargando...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="flex flex-col text-right text-white text-sm">
      <p>{customer?.first_name} {customer?.last_name}</p>
      <p className="text-xs">{customer?.email}</p>
    </div>
  );
}
