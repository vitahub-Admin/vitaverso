"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import OrdersTable from "./components/Sheet";
import Banner from "../components/Banner"

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