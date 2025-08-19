"use client"; // necesario para usar hooks como useSearchParams

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function Home() {
  const searchParams = useSearchParams();

  // Ejemplo: leer customerId y cualquier otro parámetro
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
        console.log(data)
      })
      .catch((err) => {
        console.error(err);
        setError("Error al obtener datos del cliente");
        setLoading(false);
      });
  }, [customerId]);

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <h1 className="text-xl font-bold">CONTENIDO</h1>
        {customerId && <p>Customer ID: {customerId}</p>}


        {customer && (
          <>
            <p>NOMBRE: {customer.first_name}</p>
            <p>APELLIDO: {customer.last_name}</p>
            <p>EMAIL: {customer.email}</p>
          </>
        )}
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
        FOOTER
      </footer>
    </div>
  );
}
