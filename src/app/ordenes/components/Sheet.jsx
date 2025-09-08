"use client";

import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from "@tanstack/react-table";

export default function OrdersTable({ data }) {
  const columns = useMemo(
    () => [
      { header: "Fecha de Orden", accessorKey: "created_at.value" },
      { header: "Número de Orden", accessorKey: "order_number" },
      { header: "Financial Status", accessorKey: "financial_status" },
      { header: "SKU", accessorKey: "line_items_sku" },
      {
        header: "Producto",
        accessorKey: "line_items_name",
        cell: (info) => (
          <span className="line-clamp-2 break-words">{info.getValue()}</span>
        ),
      },
      { header: "Cliente", accessorKey: "customer_first_name" },
      { header: "# Items", accessorKey: "line_items_quantity" },
      { header: "Precio Item", accessorKey: "line_items_price" },
      {
        header: "GMV",
        accessorFn: (row) =>
          row.line_items_price * row.line_items_quantity,
        cell: (info) => `$${info.getValue().toFixed(2)}`,
      },
      {
        header: "Descuento",
        accessorKey: "discount_allocations_amount",
        cell: (info) => `$${info.getValue().toFixed(2)}`,
      },
      {
        header: "% Comisión",
        accessorFn: (row) => row.comission * 100,
        cell: (info) => `${info.getValue().toFixed(0)}%`,
      },
      {
        header: "Comisión a pagar",
        accessorFn: (row) =>
          row.line_items_price * row.line_items_quantity * row.comission,
        cell: (info) => `$${info.getValue().toFixed(2)}`, // ✅ dos decimales
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: {},
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto w-full">
      <table className="min-w-full bg-blue-50 shadow-md rounded-lg text-xs">
        <thead className="bg-[#1b3f7a] text-white">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="py-2 px-3 border-r border-gray-200 cursor-pointer"
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {{
                    asc: " 🔼",
                    desc: " 🔽",
                  }[header.column.getIsSorted()] ?? null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="text-center border-b border-gray-200 hover:bg-blue-100 transition-colors"
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="py-2 px-3 border-r border-gray-200 text-xs"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
