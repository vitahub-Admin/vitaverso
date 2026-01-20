import { createColumnHelper } from "@tanstack/react-table";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

const columnHelper = createColumnHelper();

function TrendCell({ value, prev }) {
  if (prev === undefined) return <span>{value}</span>;

  const diff = value - prev;

  if (diff > 0) {
    return (
      <div className="flex items-center gap-1 text-green-600 font-medium">
        <ArrowUpRight size={14} />
        {value}
      </div>
    );
  }

  if (diff < 0) {
    return (
      <div className="flex items-center gap-1 text-red-600 font-medium">
        <ArrowDownRight size={14} />
        {value}
      </div>
    );
  }

  return <span className="text-gray-700">{value}</span>;
}

export function buildColumns(months) {
  return [
    /* ======================
       AFILIADO (STICKY)
    ====================== */
    columnHelper.group({
      id: "affiliate",
      header: "Afiliado",
      meta: { width: 260, sticky: "left" }, // sticky aquí también
      columns: [
        columnHelper.accessor(
          row => `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
          {
            id: "name",
            meta: { width: 260, sticky: "left" },
            cell: ({ row }) => {
              const { activo_carrito, vendio, activo_tienda } = row.original;

              return (
                <div className="flex flex-col gap-1">
                  <span className="font-medium">
                    {row.original.first_name} {row.original.last_name}
                  </span>
                  <span className="text-xs text-gray-500">{row.original.email}</span>

                  {/* BADGES */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {activo_carrito && (
                      <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                        Activo Carrito
                      </span>
                    )}
                    {vendio && (
                      <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                        Vendió
                      </span>
                    )}
                    {activo_tienda && (
                      <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                        Activo Tienda
                      </span>
                    )}
                  </div>
                </div>
              );
            },
          }
        ),
      ],
    }),

    /* ======================
       TOTALES (AHORA STICKY)
    ====================== */
    columnHelper.group({
      id: "totals",
      header: "Totales",
      meta: { width: 180, sticky: "left" }, // Agregado sticky
      columns: [
        columnHelper.accessor(row => row.totals?.sharecarts ?? 0, {
          id: "total_sharecarts",
          header: "SC",
          meta: { width: 90, sticky: "left" }, // sticky en cada columna
        }),
        columnHelper.accessor(row => row.totals?.orders ?? 0, {
          id: "total_orders",
          header: "Ord",
          meta: { width: 90, sticky: "left" }, // sticky en cada columna
        }),
      ],
    }),

    /* ======================
       MESES DINÁMICOS (SIN STICKY)
    ====================== */
    ...months.map((month, idx) =>
      columnHelper.group({
        id: month,
        header: month,
        meta: { monthIndex: idx }, // agregado para zebra
        columns: [
          columnHelper.accessor(
            row => row.monthly?.[month]?.sharecarts ?? 0,
            {
              id: `${month}_sharecarts`,
              header: "SC",
              meta: { width: 90, monthIndex: idx, isMonthly: true },
              cell: ({ row, getValue }) => {
                const prevMonth = months[idx - 1];
                const prev = prevMonth
                  ? row.original.monthly?.[prevMonth]?.sharecarts
                  : undefined;

                return <TrendCell value={getValue()} prev={prev} />;
              },
            }
          ),
          columnHelper.accessor(
            row => row.monthly?.[month]?.orders ?? 0,
            {
              id: `${month}_orders`,
              header: "Ord",
              meta: { width: 90, monthIndex: idx, isMonthly: true },
              cell: ({ row, getValue }) => {
                const prevMonth = months[idx - 1];
                const prev = prevMonth
                  ? row.original.monthly?.[prevMonth]?.orders
                  : undefined;

                return <TrendCell value={getValue()} prev={prev} />;
              },
            }
          ),
        ],
      })
    ),
  ];
}