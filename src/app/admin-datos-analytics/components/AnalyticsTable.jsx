"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  ShoppingCart, 
  DollarSign, 
  Store,
  User // Nuevo icono para perfil
} from "lucide-react";
import { useRouter } from "next/navigation"; // Para navegación

// Registrar todos los módulos de AG Grid
ModuleRegistry.registerModules([AllCommunityModule]);

// Componente para mostrar flechas de tendencia
function TrendRenderer(params) {
  const value = params.value || 0;
  const month = params.colDef.month;
  const type = params.colDef.type;
  
  if (!params.data?.monthly || !month) {
    return <span>{value}</span>;
  }

  const months = Object.keys(params.data.monthly || {}).sort();
  const currentIndex = months.indexOf(month);
  const prevMonth = currentIndex > 0 ? months[currentIndex - 1] : null;
  const prev = prevMonth ? params.data.monthly[prevMonth]?.[type] : undefined;

  if (prev === undefined) {
    return <span>{value}</span>;
  }

  const diff = value - prev;

  if (diff > 0) {
    return (
      <div className="flex items-center justify-center gap-1 text-green-600 font-medium">
        <ArrowUpRight size={12} />
        <span>{value}</span>
      </div>
    );
  }

  if (diff < 0) {
    return (
      <div className="flex items-center justify-center gap-1 text-red-600 font-medium">
        <ArrowDownRight size={12} />
        <span>{value}</span>
      </div>
    );
  }

  return <span className="text-gray-700 text-center block">{value}</span>;
}

// Componente para mostrar el nombre del afiliado CON enlace a perfil
function NameRenderer(params) {
  const { data } = params;

  return (
    <div className="flex flex-col gap-0.5 py-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <a
              href={`/admin-datos-afiliados/affiliates/${data.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sm leading-tight hover:text-blue-600 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {data.first_name} {data.last_name}
            </a>
            <span className="text-xs text-gray-400">↗</span>
          </div>
          <span className="text-xs text-gray-500 truncate block">{data.email}</span>
        </div>
      </div>
    </div>
  );
}
// Componente para mostrar los iconos de tags
function TagsRenderer(params) {
  const { data } = params;
  
  return (
    <div className="flex items-center justify-center gap-1 py-1">
      {data.activo_carrito && (
        <div className="relative group" title="Activo Carrito">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center hover:bg-blue-200 transition-colors">
            <ShoppingCart size={12} className="text-blue-600" />
          </div>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
            Activo Carrito
          </div>
        </div>
      )}
      
      {data.vendio && (
        <div className="relative group" title="Vendió">
          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center hover:bg-green-200 transition-colors">
            <DollarSign size={12} className="text-green-600" />
          </div>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
            Vendió
          </div>
        </div>
      )}
      
      {data.activo_tienda && (
        <div className="relative group" title="Activo Tienda">
          <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center hover:bg-yellow-200 transition-colors">
            <Store size={12} className="text-yellow-600" />
          </div>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
            Activo Tienda
          </div>
        </div>
      )}
      
      {!data.activo_carrito && !data.vendio && !data.activo_tienda && (
        <span className="text-xs text-gray-400">-</span>
      )}
    </div>
  );
}

// Función para formatear el mes: 2025-01 → 01-25
function formatMonth(monthString) {
  if (!monthString) return '';
  
  try {
    if (monthString.includes('-')) {
      const [year, month] = monthString.split('-');
      if (year && month) {
        const shortYear = year.length > 2 ? year.slice(-2) : year;
        return `${month.padStart(2, '0')}-${shortYear}`;
      }
    }
    
    return monthString;
  } catch {
    return monthString;
  }
}

export default function AGGridAnalyticsTable({ data = [], months = [] }) {
  const router = useRouter();
  
  // Formatear los meses para mostrar
  const formattedMonths = useMemo(() => 
    months.map(month => formatMonth(month)), 
    [months]
  );

  // Definir las columnas para AG Grid con grupos
  const columnDefs = useMemo(() => {
    const columns = [
      // Columna del afiliado - FIJADA A LA IZQUIERDA
      {
        headerName: "Afiliado",
        field: "name",
        pinned: "left",
        width: 200,
        cellRenderer: NameRenderer,
        filter: "agTextColumnFilter",
        sortable: true,
        suppressMovable: true,
        cellClass: "bg-white",
        valueGetter: (params) => 
          `${params.data?.first_name || ""} ${params.data?.last_name || ""}`.trim(),
      },
      // Columna de tags/iconos - FIJADA A LA IZQUIERDA
      {
        headerName: "Estado",
        field: "tags",
        pinned: "left",
        width: 80,
        cellRenderer: TagsRenderer,
        suppressMovable: true,
        cellClass: "bg-white",
        sortable: false,
        filter: false,
      },
      // Total SC - FIJADA A LA IZQUIERDA
      {
        headerName: "SC",
        field: "total_sharecarts",
        pinned: "left",
        width: 60,
        sortable: true,
        filter: "agNumberColumnFilter",
        suppressMovable: true,
        cellClass: "bg-white",
        valueGetter: (params) => params.data?.totals?.sharecarts || 0,
        cellStyle: { textAlign: 'center' },
        headerClass: "text-center",
      },
      // Total Ord - FIJADA A LA IZQUIERDA
      {
        headerName: "Ord",
        field: "total_orders",
        pinned: "left",
        width: 60,
        sortable: true,
        filter: "agNumberColumnFilter",
        suppressMovable: true,
        cellClass: "bg-white",
        valueGetter: (params) => params.data?.totals?.orders || 0,
        cellStyle: { textAlign: 'center' },
        headerClass: "text-center",
      },
    ];

    // Añadir columnas mensuales dinámicas con GRUPOS
    months.forEach((originalMonth, index) => {
      const formattedMonth = formattedMonths[index];
      const bgClass = index % 2 === 0 ? "bg-gray-100" : "bg-gray-50";
      
      // Grupo padre para el mes
      columns.push({
        headerName: formattedMonth,
        headerClass: `${bgClass} font-bold text-center`,
        marryChildren: true,
        children: [
          // Hijo 1: SC del mes
          {
            headerName: "SC",
            width: 60,
            sortable: true,
            filter: "agNumberColumnFilter",
            cellRenderer: TrendRenderer,
            cellClass: `${bgClass} border-l border-gray-200`,
            headerClass: `${bgClass} text-center font-medium`,
            month: originalMonth,
            type: "sharecarts",
            valueGetter: (params) => params.data?.monthly?.[originalMonth]?.sharecarts || 0,
            cellStyle: { 
              textAlign: 'center',
              borderLeft: '1px solid #e5e7eb'
            },
          },
          // Hijo 2: Ord del mes
          {
            headerName: "Ord",
            width: 60,
            sortable: true,
            filter: "agNumberColumnFilter",
            cellRenderer: TrendRenderer,
            cellClass: `${bgClass} border-r border-gray-200`,
            headerClass: `${bgClass} text-center font-medium`,
            month: originalMonth,
            type: "orders",
            valueGetter: (params) => params.data?.monthly?.[originalMonth]?.orders || 0,
            cellStyle: { 
              textAlign: 'center',
              borderRight: '1px solid #e5e7eb'
            },
          },
        ],
      });
    });

    return columns;
  }, [months, formattedMonths]);

  // Configuración por defecto de las columnas
  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    suppressMovable: true,
  }), []);

  // Configurar doble click en fila para ir al perfil
  const onRowDoubleClicked = (params) => {
    if (params.data?.id) {
      router.push(`/admin-datos-afiliados/affiliates/${params.data.id}`);
    }
  };

  return (
    <div className="ag-theme-alpine h-[600px] w-full border rounded-lg overflow-hidden">
      <style jsx global>{`
        .ag-theme-alpine {
          --ag-borders: solid 1px;
          --ag-border-color: #e5e7eb;
          --ag-row-border-color: #f3f4f6;
        }
        
        .ag-header-cell {
          border-right: 1px solid #e5e7eb !important;
        }
        
        .ag-header-group-cell {
          border-bottom: 2px solid #d1d5db !important;
          font-weight: 600 !important;
        }
        
        .bg-gray-100 {
          background-color: #f3f4f6 !important;
        }
        
        .bg-gray-50 {
          background-color: #f9fafb !important;
        }
        
        /* Mejorar visibilidad del zebra */
        .ag-row-even {
          background-color: #ffffff;
        }
        
        .ag-row-odd {
          background-color: #f8fafc;
        }
        
        /* Estilos para columnas fijas */
        .ag-pinned-left-cols-container {
          box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);
        }
        
        /* Estilos para headers de grupos */
        .ag-header-group-cell-label {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100%;
        }
        
        /* Hover en filas */
        .ag-row-hover {
          background-color: #f0f9ff !important;
          cursor: pointer;
        }
      `}</style>
      
      <AgGridReact
        rowData={data}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        pagination={true}
        paginationPageSize={20}
        rowHeight={45}
        headerHeight={40}
        suppressRowClickSelection={true}
        animateRows={true}
        enableCellTextSelection={true}
        ensureDomOrder={true}
        onGridReady={(params) => {
          params.api.sizeColumnsToFit();
        }}
        onFirstDataRendered={(params) => {
          params.api.sizeColumnsToFit();
        }}
        onRowDoubleClicked={onRowDoubleClicked}
        getRowClass={(params) => {
          return 'cursor-pointer hover:bg-blue-50';
        }}
      />
    </div>
  );
}