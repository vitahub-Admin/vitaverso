"use client";

import { useEffect, useState, useMemo } from "react";
import AGGridAnalyticsTable from "./components/AnalyticsTable";

/* Extrae los meses dinámicos desde la data */
function extractMonthsFromData(data) {
  const set = new Set();

  data.forEach(row => {
    Object.keys(row.monthly || {}).forEach(month => {
      set.add(month);
    });
  });

  return Array.from(set).sort();
}

export default function AdminDatosAnalyticsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    activo_carrito: false,
    vendio: false,
    activo_tienda: false,
  });

  useEffect(() => {
    fetch("/api/admin/affiliates/analytics")
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setData(json.data || []);
        } else {
          console.error("Error del backend:", json.error);
          setData([]);
        }
        setLoading(false);
      })
      .catch(error => {
        console.error("Error fetching data:", error);
        setLoading(false);
      });
  }, []);

  // TODOS LOS HOOKS PRIMERO
  const months = useMemo(() => extractMonthsFromData(data), [data]);
  
  // Filtrar datos con múltiples criterios
  const filteredData = useMemo(() => {
    if (!data.length) return data;
    
    return data.filter(row => {
      // 1. Filtro de búsqueda de texto
      const searchMatch = !globalFilter.trim() || (() => {
        const search = globalFilter.toLowerCase();
        const fullName = `${row.first_name || ''} ${row.last_name || ''} ${row.email || ''}`.toLowerCase();
        return fullName.includes(search);
      })();
      
      if (!searchMatch) return false;
      
      // 2. Filtros de tags/badges
      const activoCarritoMatch = !activeFilters.activo_carrito || row.activo_carrito;
      const vendioMatch = !activeFilters.vendio || row.vendio;
      const activoTiendaMatch = !activeFilters.activo_tienda || row.activo_tienda;
      
      return activoCarritoMatch && vendioMatch && activoTiendaMatch;
    });
  }, [data, globalFilter, activeFilters]);

  // Estadísticas para mostrar en los botones
  const stats = useMemo(() => {
    if (!data.length) return { activo_carrito: 0, vendio: 0, activo_tienda: 0, total: 0 };
    
    return {
      activo_carrito: data.filter(row => row.activo_carrito).length,
      vendio: data.filter(row => row.vendio).length,
      activo_tienda: data.filter(row => row.activo_tienda).length,
      total: data.length,
    };
  }, [data]);

  // Manejar toggle de filtros
  const toggleFilter = (filterName) => {
    setActiveFilters(prev => ({
      ...prev,
      [filterName]: !prev[filterName]
    }));
  };

  // Limpiar todos los filtros
  const clearAllFilters = () => {
    setActiveFilters({
      activo_carrito: false,
      vendio: false,
      activo_tienda: false,
    });
    setGlobalFilter("");
  };

  if (loading) {
    return <div className="p-6">Cargando analytics…</div>;
  }

  return (
    <div className="p-6 space-y-4">
      {/* 🔍 BARRA SUPERIOR CON FILTROS */}
      <div className="space-y-4">
        {/* FILA 1: BUSCADOR Y BOTÓN EXPORTAR */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="w-full sm:w-auto">
            <input
              type="text"
              placeholder="Buscar por nombre, apellido o email…"
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              className="w-full sm:w-96 border rounded-md px-3 py-2 text-sm"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={clearAllFilters}
              className="px-3 py-2 text-sm border rounded-md hover:bg-gray-50"
            >
              Limpiar filtros
            </button>
            
            <a
              href="/api/admin/affiliates/analytics/export"
              className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
            >
              Exportar CSV
            </a>
          </div>
        </div>

        {/* FILA 2: FILTROS RÁPIDOS */}
        <div className="flex flex-wrap gap-2">
          {/* FILTRO ACTIVO CARRITO */}
          <button
            onClick={() => toggleFilter('activo_carrito')}
            className={`
              inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors
              ${activeFilters.activo_carrito 
                ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
              }
            `}
          >
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Activo Carrito
            </span>
            <span className="bg-blue-200 text-blue-800 text-xs px-2 py-0.5 rounded-full">
              {stats.activo_carrito}
            </span>
          </button>

          {/* FILTRO VENDIÓ */}
          <button
            onClick={() => toggleFilter('vendio')}
            className={`
              inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors
              ${activeFilters.vendio 
                ? 'bg-green-100 text-green-800 border border-green-300' 
                : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
              }
            `}
          >
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Vendió
            </span>
            <span className="bg-green-200 text-green-800 text-xs px-2 py-0.5 rounded-full">
              {stats.vendio}
            </span>
          </button>

          {/* FILTRO ACTIVO TIENDA */}
          <button
            onClick={() => toggleFilter('activo_tienda')}
            className={`
              inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors
              ${activeFilters.activo_tienda 
                ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' 
                : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200'
              }
            `}
          >
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
              Activo Tienda
            </span>
            <span className="bg-yellow-200 text-yellow-800 text-xs px-2 py-0.5 rounded-full">
              {stats.activo_tienda}
            </span>
          </button>

          {/* CONTADOR DE RESULTADOS */}
          <div className="ml-auto text-sm text-gray-600 flex items-center">
            <span className="font-medium">{filteredData.length}</span>
            <span className="mx-1">de</span>
            <span>{stats.total}</span>
            <span className="ml-2">afiliados</span>
          </div>
        </div>

        {/* INDICADORES DE FILTROS ACTIVOS */}
        {Object.values(activeFilters).some(value => value) && (
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span className="font-medium">Filtros activos:</span>
            {activeFilters.activo_carrito && (
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Activo Carrito</span>
            )}
            {activeFilters.vendio && (
              <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">Vendió</span>
            )}
            {activeFilters.activo_tienda && (
              <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Activo Tienda</span>
            )}
          </div>
        )}
      </div>

      {/* TABLA */}
      <AGGridAnalyticsTable 
        data={filteredData} 
        months={months} 
      />
    </div>
  );
}