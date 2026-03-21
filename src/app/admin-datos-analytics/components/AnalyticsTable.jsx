"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import {
  ArrowUpRight, ArrowDownRight,
  ShoppingCart, DollarSign, Store, MessageSquare, Video,
  CalendarClock, CalendarCheck, CalendarX, CalendarOff
} from "lucide-react";
import { useRouter } from "next/navigation";

ModuleRegistry.registerModules([AllCommunityModule]);

const VAMBE_COLOR = "#7c3aed";

// ── Meet status config ─────────────────────────────────────────────────────
const MEET_STATUS = {
  none:     { icon: CalendarOff,   color: "text-gray-300",    bg: "bg-gray-100",    title: "Sin reunión"         },
  future:   { icon: CalendarClock, color: "text-blue-500",    bg: "bg-blue-100",    title: "Reunión a futuro"    },
  attended: { icon: CalendarCheck, color: "text-emerald-500", bg: "bg-emerald-100", title: "Asistió a reunión"   },
  missed:   { icon: CalendarX,     color: "text-red-400",     bg: "bg-red-100",     title: "Faltó a reunión"     },
};

// ── Trend cell ─────────────────────────────────────────────────────────────
function TrendCell({ current, previous }) {
  const diff = current - previous;
  const isUp   = diff > 0;
  const isDown = diff < 0;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-0.5">
      <span className={`text-sm font-bold leading-none ${isUp ? "text-emerald-600" : isDown ? "text-red-500" : "text-gray-700"}`}>
        {current}
      </span>
      {diff !== 0 && (
        <span className={`flex items-center text-[0.6rem] font-semibold leading-none ${isUp ? "text-emerald-500" : "text-red-400"}`}>
          {isUp ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
          {Math.abs(diff)}
        </span>
      )}
    </div>
  );
}

// ── Name cell ──────────────────────────────────────────────────────────────
function NameRenderer({ data }) {
  const joinDate = data.created_at
    ? new Date(data.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    <div className="flex flex-col justify-center gap-0.5 py-1 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <a
          href={`/admin-datos-afiliados/affiliates/${data.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-sm text-gray-800 hover:text-blue-600 hover:underline truncate"
          onClick={e => e.stopPropagation()}
        >
          {data.first_name} {data.last_name}
        </a>
        {data.is_new && (
          <span className="shrink-0 text-[0.6rem] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">NEW</span>
        )}
      </div>
      <span className="text-xs text-gray-400 truncate">{data.email}</span>
      {joinDate && (
        <span className="text-[0.65rem] text-gray-300">Desde {joinDate}</span>
      )}
    </div>
  );
}

// ── Actividad comercial ────────────────────────────────────────────────────
function ActividadRenderer({ data }) {
  return (
    <div className="flex items-center justify-center gap-1 h-full">
      {data.activo_carrito && (
        <div title="Activo Carrito" className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
          <ShoppingCart size={11} className="text-blue-600" />
        </div>
      )}
      {data.vendio && (
        <div title="Vendió" className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
          <DollarSign size={11} className="text-emerald-600" />
        </div>
      )}
      {data.active_store && (
        <div title="Tienda activa" className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center">
          <Store size={11} className="text-yellow-600" />
        </div>
      )}
      {!data.activo_carrito && !data.vendio && !data.active_store && (
        <span className="text-xs text-gray-300">—</span>
      )}
    </div>
  );
}

// ── Comunicaciones ─────────────────────────────────────────────────────────
function ComunicacionesRenderer({ data }) {
  const meet = MEET_STATUS[data.meet_status ?? 'none'];
  const MeetIcon = meet.icon;

  return (
    <div className="flex items-center justify-center gap-1.5 h-full">
      {/* Vambe */}
      {data.vambe_url ? (
        <a
          href={data.vambe_url}
          target="_blank"
          rel="noopener noreferrer"
          title="Ver en Vambe"
          onClick={e => e.stopPropagation()}
          className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center hover:bg-purple-200 transition-colors"
        >
          <MessageSquare size={11} style={{ color: VAMBE_COLOR }} />
        </a>
      ) : (
        <div title="Sin Vambe" className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
          <MessageSquare size={11} className="text-gray-300" />
        </div>
      )}

      {/* Meet status */}
      <div title={meet.title} className={`w-6 h-6 rounded-full ${meet.bg} flex items-center justify-center`}>
        <MeetIcon size={11} className={meet.color} />
      </div>
    </div>
  );
}

// ── Period renderers ───────────────────────────────────────────────────────
function SC30Renderer({ data })  { return <TrendCell current={data.sc_30}  previous={data.sc_60}  />; }
function Ord30Renderer({ data }) { return <TrendCell current={data.ord_30} previous={data.ord_60} />; }
function SC60Renderer({ data })  { return <TrendCell current={data.sc_60}  previous={data.sc_90}  />; }
function Ord60Renderer({ data }) { return <TrendCell current={data.ord_60} previous={data.ord_90} />; }
function SC90Renderer({ data })  { return <TrendCell current={data.sc_90}  previous={0}           />; }
function Ord90Renderer({ data }) { return <TrendCell current={data.ord_90} previous={0}           />; }

// ── Main component ─────────────────────────────────────────────────────────
export default function AGGridAnalyticsTable({ data = [] }) {
  const router = useRouter();

  const columnDefs = useMemo(() => [
    {
      headerName: "Afiliado",
      field: "name",
      pinned: "left",
      width: 210,
      cellRenderer: NameRenderer,
      sortable: true,
      suppressMovable: true,
      cellClass: "bg-white",
      valueGetter: p => `${p.data?.first_name || ""} ${p.data?.last_name || ""}`.trim(),
    },
    {
      headerName: "Actividad",
      field: "actividad",
      pinned: "left",
      width: 90,
      cellRenderer: ActividadRenderer,
      suppressMovable: true,
      cellClass: "bg-white",
      sortable: false,
      filter: false,
    },
    {
      headerName: "Comms",
      field: "comms",
      pinned: "left",
      width: 80,
      cellRenderer: ComunicacionesRenderer,
      suppressMovable: true,
      cellClass: "bg-white",
      sortable: false,
      filter: false,
    },
    // ── Últimos 30 días ──────────────────────────────────
    {
      headerName: "Últimos 30 días",
      headerClass: "bg-blue-50 font-bold text-center",
      marryChildren: true,
      children: [
        {
          headerName: "SC",
          width: 70,
          cellRenderer: SC30Renderer,
          cellClass: "bg-blue-50/30",
          headerClass: "bg-blue-50 text-center",
          sortable: true,
          valueGetter: p => p.data?.sc_30 || 0,
          cellStyle: { textAlign: "center" },
        },
        {
          headerName: "Ord",
          width: 70,
          cellRenderer: Ord30Renderer,
          cellClass: "bg-blue-50/30",
          headerClass: "bg-blue-50 text-center",
          sortable: true,
          valueGetter: p => p.data?.ord_30 || 0,
          cellStyle: { textAlign: "center" },
        },
      ],
    },
    // ── 31-60 días ───────────────────────────────────────
    {
      headerName: "31 a 60 días",
      headerClass: "bg-gray-50 font-bold text-center",
      marryChildren: true,
      children: [
        {
          headerName: "SC",
          width: 70,
          cellRenderer: SC60Renderer,
          cellClass: "bg-gray-50/30",
          headerClass: "bg-gray-50 text-center",
          sortable: true,
          valueGetter: p => p.data?.sc_60 || 0,
          cellStyle: { textAlign: "center" },
        },
        {
          headerName: "Ord",
          width: 70,
          cellRenderer: Ord60Renderer,
          cellClass: "bg-gray-50/30",
          headerClass: "bg-gray-50 text-center",
          sortable: true,
          valueGetter: p => p.data?.ord_60 || 0,
          cellStyle: { textAlign: "center" },
        },
      ],
    },
    // ── 61-90 días ───────────────────────────────────────
    {
      headerName: "61 a 90 días",
      headerClass: "bg-gray-100 font-bold text-center",
      marryChildren: true,
      children: [
        {
          headerName: "SC",
          width: 70,
          cellRenderer: SC90Renderer,
          cellClass: "bg-gray-100/30",
          headerClass: "bg-gray-100 text-center",
          sortable: true,
          valueGetter: p => p.data?.sc_90 || 0,
          cellStyle: { textAlign: "center" },
        },
        {
          headerName: "Ord",
          width: 70,
          cellRenderer: Ord90Renderer,
          cellClass: "bg-gray-100/30",
          headerClass: "bg-gray-100 text-center",
          sortable: true,
          valueGetter: p => p.data?.ord_90 || 0,
          cellStyle: { textAlign: "center" },
        },
      ],
    },
  ], []);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    suppressMovable: true,
  }), []);

  return (
    <div className="ag-theme-alpine h-[600px] w-full border rounded-lg overflow-hidden">
      <style jsx global>{`
        .ag-theme-alpine {
          --ag-borders: solid 1px;
          --ag-border-color: #e5e7eb;
          --ag-row-border-color: #f3f4f6;
        }
        .ag-header-group-cell { border-bottom: 2px solid #d1d5db !important; }
        .ag-pinned-left-cols-container { box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1); }
        .ag-row-hover { background-color: #f0f9ff !important; cursor: pointer; }
        .ag-row-even { background-color: #ffffff; }
        .ag-row-odd  { background-color: #f8fafc; }
      `}</style>

      <AgGridReact
        rowData={data}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        pagination={true}
        paginationPageSize={20}
        rowHeight={52}
        headerHeight={40}
        suppressRowClickSelection={true}
        animateRows={true}
        enableCellTextSelection={true}
        ensureDomOrder={true}
        onGridReady={p => p.api.sizeColumnsToFit()}
        onFirstDataRendered={p => p.api.sizeColumnsToFit()}
        onRowDoubleClicked={p => p.data?.id && router.push(`/admin-datos-afiliados/affiliates/${p.data.id}`)}
      />
    </div>
  );
}