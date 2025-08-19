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

  if (!customerId) return <p>No se proporcionó Customer ID</p>;
  if (loading) return <p>Cargando datos del cliente...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="flex flex-col gap-4">
      <p><strong>NOMBRE:</strong> {customer?.first_name}</p>
      <p><strong>APELLIDO:</strong> {customer?.last_name}</p>
      <p><strong>EMAIL:</strong> {customer?.email}</p>
    </div>
  );
}
