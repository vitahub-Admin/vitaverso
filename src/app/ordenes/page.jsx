"use client";

import { useEffect, useState, useMemo } from "react";
import Cookies from "js-cookie";
import OrdersTable from "./components/Sheet";
import Banner from "../components/Banner"
import Chart1 from "./components/Chart1";
import Chart2 from "./components/Chart2";

export default function OrdenesPage() {
  const [error, setError] = useState("");
  const [ordenesData, setOrdenesData] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  // Setear fechas por defecto últimos 30 días
  useEffect(() => {
    const today = new Date();
    const priorDate = new Date();
    priorDate.setDate(today.getDate() - 30);

    setStartDate(priorDate.toISOString().split("T")[0]);
    setEndDate(today.toISOString().split("T")[0]);
  }, []);

  const fetchData = async (customerId, from, to) => {
    setLoading(true);
    setError("");
    
    try {
      let url = `/api/google/${customerId}`;
      if (from && to) {
        url += `?from=${from}&to=${to}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      
      if (!data.success) {
        setError(data.message);
        return;
      }
      setOrdenesData(data.data);
      console.log('📦 Orders data:', data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
  }, []);

  const handleFilter = () => {
    const customerId = Cookies.get("customerId");
    if (!customerId) return;
    fetchData(customerId, startDate, endDate);
  };
  const totals = useMemo(() => {
    let ganancia = 0;
    let items = 0;
    const uniqueOrders = new Set();
  
    ordenesData.forEach((order) => {
      // ya viene calculado por BigQuery
      ganancia += Number(order.ganancia_total) || 0;
      items += Number(order.total_items) || 0;
  
      uniqueOrders.add(order.order_number);
    });
  
    return {
      ganancia,
      items,
      carritos: uniqueOrders.size,
    };
  }, [ordenesData]);
  return (
    <div className="flex flex-col items-center gap-6 p-4">

<Banner youtubeVideoUrl="https://www.youtube.com/watch?v=LL-jZPoVZXg" />      
      {/* Header de sección con filtros */}
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato">
          Órdenes
        </h1>

        {/* Filtros */}
        <div className="flex gap-2 mt-2 md:mt-0 items-center">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border p-2 rounded text-white border-white bg-transparent"
          />
          <span className="text-white">a</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border p-2 rounded text-white border-white bg-transparent"
          />
          <button
            onClick={handleFilter}
            disabled={loading}
            className="px-4 py-2 bg-white text-[#1b3f7a] rounded border border-gray-200 
                     hover:bg-[#f0f0f0] active:bg-[#d6d6d6] transition-colors disabled:opacity-50"
          >
            {loading ? "Cargando..." : "Filtrar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
    {/* Cards de resumen */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 w-full max-w-6xl">
  {/* Card Ganancias */}
  <div className="bg-white shadow-md rounded-lg p-4 flex items-center gap-4">
    <img src="/ganancias.png" alt="Ganancias" className="w-12 h-12 md:w-24 md:h-24 object-contain" />
    <div>
      <p className="text-gray-500 text-sm">Ganancias</p>
      <p className="text-2xl md:text-3xl font-bold text-[#1b3f7a]">
        ${totals.ganancia.toFixed(2)}
      </p>
    </div>
  </div>

  {/* Card Items */}
  <div className="bg-white shadow-md rounded-lg p-4 flex items-center gap-4">
    <img src="/items.png" alt="Items Vendidos" className="w-12 h-12 md:w-24 md:h-24 object-contain" />
    <div>
      <p className="text-gray-500 text-sm">Total Items Vendidos</p>
      <p className="text-2xl md:text-3xl font-bold text-[#1b3f7a]">
        {totals.items}
      </p>
    </div>
  </div>

  {/* Card Carritos */}
  <div className="bg-white shadow-md rounded-lg p-4 flex items-center gap-4">
    <img src="/ordenes.png" alt="Carritos Vendidos" className="w-12 h-12 md:w-24 md:h-24 object-contain" />
    <div>
      <p className="text-gray-500 text-sm">Total Carritos Vendidos</p>
      <p className="text-2xl md:text-3xl font-bold text-[#1b3f7a]">
        {totals.carritos}
      </p>
    </div>
  </div>
</div>
      {/* Charts */}
   {/* Charts */}
{ordenesData.length > 0 && (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-6xl">
    <div className="bg-white shadow-md rounded p-4">
      <Chart1 data={ordenesData} />
    </div>
    <div className="bg-white shadow-md rounded p-4">
      <Chart2 data={ordenesData} />
    </div>
  </div>
)}
      {ordenesData.length > 0 ? (
        <div className="w-full max-w-6xl">
          <OrdersTable data={ordenesData} />
        </div>
      ) : (
        !loading && (
          <div className="text-center py-8 text-gray-500">
            No se encontraron órdenes en el período seleccionado
          </div>
        )
      )}
    </div>
  );
}