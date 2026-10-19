"use client";

// Lo que toman los pacientes en Mi Vitahub y Vitahub no vende: para decidir qué sumar al catálogo.
import { useEffect, useState } from "react";
import { PackageSearch, RefreshCw } from "lucide-react";

function fecha(iso) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProductosPacientesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function cargar() {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/custom-supplements").then((r) => r.json());
      if (!d.ok) throw new Error(d.error ?? "Error");
      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  return (
    <div className="min-h-screen bg-[#F7F9FB] text-gray-900">
      <div className="w-full border-b border-[#D0E4EC] bg-white px-6">
        <div className="max-w-[920px] mx-auto py-6 flex items-center gap-3">
          <PackageSearch size={22} className="text-[#1b3f7a]" />
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-[#1b3f7a] leading-none">Productos de pacientes</h1>
            <p className="text-sm text-[#5B7A8C] mt-1">
              Suplementos que los pacientes cargaron en Mi Vitahub y no están en el catálogo.
            </p>
          </div>
          <button onClick={cargar} className="text-[#5B7A8C] hover:text-[#1b3f7a]" aria-label="Actualizar">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="max-w-[920px] mx-auto px-6 py-8">
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        ) : !data ? (
          <p className="text-sm text-[#8AAAB8]">Cargando...</p>
        ) : data.productos.length === 0 ? (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-8 text-center">
            <p className="text-sm font-bold text-[#1b3f7a]">Todavía no hay productos cargados por pacientes</p>
            <p className="text-xs text-[#5B7A8C] mt-1">
              Aparecen aquí cuando un paciente agrega en la app un suplemento que no vendemos.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#EEF3F7] text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
              {data.total} productos · ordenados por cantidad de pacientes
            </div>
            <div className="divide-y divide-[#EEF3F7]">
              {data.productos.map((p) => (
                <div key={p.nombre} className="flex items-center gap-4 px-5 py-4">
                  {p.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.foto} alt="" className="w-14 h-14 rounded-xl object-cover border border-[#D0E4EC] shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-[#E6F4F8] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#1b3f7a] leading-snug">{p.nombre}</p>
                    {p.variantes.length ? (
                      <p className="text-xs text-[#8AAAB8] mt-0.5">También escrito como: {p.variantes.join(", ")}</p>
                    ) : null}
                    <p className="text-xs text-[#5B7A8C] mt-0.5">Último registro: {fecha(p.ultimo)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-extrabold tabular-nums text-[#1b3f7a] leading-none">{p.pacientes}</p>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mt-1">
                      paciente{p.pacientes !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-[#1E8FA8] tabular-nums mt-0.5">{p.activos} lo siguen tomando</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
