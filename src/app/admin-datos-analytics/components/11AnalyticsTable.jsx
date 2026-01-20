"use client";

import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from "@tanstack/react-table";

/* 🔍 Filtro global: nombre + apellido + email */
function globalTextFilter(row, _columnId, filterValue) {
  const search = filterValue.toLowerCase();

  const { first_name, last_name, email } = row.original;

  return (
    `${first_name ?? ""} ${last_name ?? ""} ${email ?? ""}`
      .toLowerCase()
      .includes(search)
  );
}

export default function AnalyticsTable({
  data = [],
  columns = [],
  globalFilter = "",
}) {
  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
    },
    globalFilterFn: globalTextFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Función para obtener estilos sticky
  const getStickyStyles = (columnId) => {
    const column = table.getColumn(columnId);
    const meta = column?.columnDef.meta;
    
    if (!meta?.sticky) return {};
    
    let left = 0;
    const allColumns = table.getVisibleLeafColumns();
    
    // Calcular posición izquierda sumando anchos de columnas sticky previas
    for (const col of allColumns) {
      if (col.id === columnId) break;
      if (col.columnDef.meta?.sticky) {
        left += col.columnDef.meta?.width || 0;
      }
    }
    
    return {
      position: 'sticky',
      left: `${left}px`,
      zIndex: 20,
      backgroundColor: 'white',
    };
  };

  // Función para estilos del header sticky
  const getHeaderStickyStyles = (columnId) => {
    const column = table.getColumn(columnId);
    const meta = column?.columnDef.meta;
    
    if (!meta?.sticky) return {};
    
    let left = 0;
    const allColumns = table.getVisibleLeafColumns();
    
    for (const col of allColumns) {
      if (col.id === columnId) break;
      if (col.columnDef.meta?.sticky) {
        left += col.columnDef.meta?.width || 0;
      }
    }
    
    return {
      position: 'sticky',
      left: `${left}px`,
      zIndex: 30,
      backgroundColor: '#f9fafb',
    };
  };

  // Función para fondo de columnas mensuales
  const getMonthBg = (columnId) => {
    const column = table.getColumn(columnId);
    const meta = column?.columnDef.meta;
    
    if (!meta?.isMonthly) return '';
    
    return meta.monthIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white';
  };

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                const stickyStyles = getHeaderStickyStyles(header.id);
                
                return (
                  <th
                    key={header.id}
                    style={stickyStyles}
                    className={`
                      border px-3 py-2 text-left font-semibold
                      ${header.column.columnDef.meta?.sticky ? 'border-r-2' : ''}
                    `}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>

        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="hover:bg-gray-50">
              {row.getVisibleCells().map(cell => {
                const stickyStyles = getStickyStyles(cell.column.id);
                const monthBg = getMonthBg(cell.column.id);
                
                return (
                  <td
                    key={cell.id}
                    style={stickyStyles}
                    className={`
                      border px-3 py-2 whitespace-nowrap
                      ${monthBg}
                      ${cell.column.columnDef.meta?.sticky ? 'border-r-2' : ''}
                    `}
                  >
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}