"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function HomeCharts() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId");

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!customerId) return;

    setLoading(true);
    fetch(`/api/shopify/orders/${customerId}`)
      .then((res) => res.json())
      .then((data) => {
        setOrders(data?.data?.orders?.edges|| []);
        setLoading(false);
        console.log(data)
      })
      .catch((err) => {
        setError("Error al obtener órdenes");
        setLoading(false);
        console.log(err)
      });
  }, [customerId]);

  if (!customerId) return <p>Debe indicar un customerId</p>;
  if (loading) return <p>Cargando órdenes...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div>
      <h2>Órdenes para specialist_ref: {customerId}</h2>
      {orders.length === 0 && <p>No se encontraron órdenes</p>}
      {orders.map(({ node }) => (
        <div key={node.id}>
          <p>Orden: {node.name}</p>
          <p>Fecha: {new Date(node.createdAt).toLocaleString()}</p>
          <p>Total: {node.totalPriceSet.shopMoney.amount} {node.totalPriceSet.shopMoney.currencyCode}</p>
        </div>
      ))}
    </div>
  );
}
