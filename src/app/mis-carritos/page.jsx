"use client";

import { useEffect, useState, useMemo } from "react";
import Cookies from "js-cookie";
import Sheet from "./components/Sheet";
import Banner from "../components/Banner"


export default function CarritosPage() {
  const [error, setError] = useState("");
  const [ordenesData, setOrdenesData] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Setear fechas por defecto últimos 30 días
  useEffect(() => {
    const today = new Date();
    const priorDate = new Date();
    priorDate.setDate(today.getDate() - 30);

    setStartDate(priorDate.toISOString().split("T")[0]);
    setEndDate(today.toISOString().split("T")[0]);
  }, []);

  const fetchData = (customerId, from, to) => {
    let url = `/api/google/carts/${customerId}`;
    if (from && to) {
      url += `?from=${from}&to=${to}`;
    }

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          setError(data.message);
          return;
        }
        setOrdenesData(data.data);
        console.log(data.data)
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    const today = new Date();
    const priorDate = new Date();
    priorDate.setDate(today.getDate() - 30);
  
    const start = priorDate.toISOString().split("T")[0];
    const end = today.toISOString().split("T")[0];
  
    setStartDate(start);
    setEndDate(end);
  
    const customerId = Cookies.get("customerId");
    if (!customerId) {
      setError("No hay customerId disponible");
      return;
    }
    fetchData(customerId, start, end);
  }, []); // 👈 solo una vez al montar

  const handleFilter = () => {
    const customerId = Cookies.get("customerId");
 
    if (!customerId) return;
  fetchData(customerId, startDate, endDate);
  };

  // Totales para cards
  const totals = useMemo(() => {
    let ganancia = 0;
    let items = 0;
    let carritos = 0;

    ordenesData.forEach((item) => {
      ganancia += item.line_items_price * item.comission * item.line_items_quantity;
      items += item.line_items_quantity;
      carritos += 1;
    });

    return { ganancia, items, carritos };
  }, [ordenesData]);

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <Banner/>
    {/* Header de sección con filtros */}
<div className="w-full  bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
  {/* Título */}
  <h1 className="text-3xl md:text-4xl text-white font-lato">
    Mis Carritos Compartidos
  </h1>

  {/* Filtros */}
  <div className="flex gap-2 mt-2 md:mt-0 items-center">
    <input
      type="date"
      value={startDate}
      onChange={(e) => setStartDate(e.target.value)}
      className="border p-2 rounded text-white border-white"
    />
    <span className="text-white">a</span>
    <input
      type="date"
      value={endDate}
      onChange={(e) => setEndDate(e.target.value)}
      className="border p-2 rounded text-white border-white"
    />
    <button
      onClick={handleFilter}
      className="px-4 py-2 bg-white text-[#1b3f7a] rounded"
    >
      Filtrar
    </button>
  </div>
</div>

      {/* Charts */}
   {/* Charts */}

{ordenesData.length > 0 && (
 
  <div className="bg-white shadow-md rounded p-4">
    <Sheet data={ordenesData} />
  </div>
)}

    </div>
  );
}
