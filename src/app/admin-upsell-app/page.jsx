"use client";

// Sugeridos del carrito de Mi Vitahub ("Completa tu pedido"): qué productos se ofrecen,
// en qué orden y con qué texto. Los cambios se ven en la app al volver a abrir el carrito.
import { useEffect, useRef, useState } from "react";
import { ShoppingBag, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

export default function UpsellAppPage() {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const debounce = useRef(null);

  async function cargar() {
    setCargando(true);
    try {
      const d = await fetch("/api/admin/app-upsell").then((r) => r.json());
      if (!d.ok) throw new Error(d.error);
      setLista(d.sugeridos);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (busqueda.trim().length < 2) { setResultados([]); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const d = await fetch(`/api/admin/app-upsell?buscar=${encodeURIComponent(busqueda.trim())}`).then((r) => r.json());
        setResultados(d.resultados ?? []);
      } finally {
        setBuscando(false);
      }
    }, 350);
  }, [busqueda]);

  async function llamar(method, body, query = "") {
    const r = await fetch(`/api/admin/app-upsell${query}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then((x) => x.json());
    if (!r.ok) setError(r.error ?? "Error");
    await cargar();
  }

  async function mover(i, dir) {
    const a = lista[i];
    const b = lista[i + dir];
    if (!a || !b) return;
    await llamar("PATCH", { id: a.id, position: b.position });
    await llamar("PATCH", { id: b.id, position: a.position });
  }

  const yaEsta = new Set(lista.map((s) => String(s.variant_id)));

  return (
    <div className="min-h-screen bg-[#F7F9FB] text-gray-900">
      <div className="w-full border-b border-[#D0E4EC] bg-white px-6">
        <div className="max-w-[860px] mx-auto py-6 flex items-center gap-3">
          <ShoppingBag size={22} className="text-[#1b3f7a]" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#1b3f7a] leading-none">Sugeridos del carrito</h1>
            <p className="text-sm text-[#5B7A8C] mt-1">
              Productos que Mi Vitahub ofrece en "Completa tu pedido", después de los recomendados del profesional del paciente.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[860px] mx-auto px-6 py-8 flex flex-col gap-6">
        {error ? <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p> : null}

        <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Agregar producto</p>
          <div className="relative">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o marca..."
              className="w-full border border-[#D0E4EC] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2BB9B8]/30"
            />
            {busqueda.trim().length >= 2 ? (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#D0E4EC] rounded-xl shadow-lg max-h-72 overflow-y-auto">
                {buscando ? (
                  <p className="px-4 py-3 text-sm text-[#8AAAB8]">Buscando...</p>
                ) : resultados.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-[#8AAAB8]">Sin resultados</p>
                ) : resultados.map((r) => (
                  <button
                    key={r.variant_id}
                    disabled={yaEsta.has(String(r.variant_id))}
                    onClick={async () => {
                      await llamar("POST", { variant_id: r.variant_id, product_id: r.product_id, title: r.title });
                      setBusqueda("");
                    }}
                    className="w-full text-left px-4 py-3 border-b border-[#EEF3F7] last:border-0 hover:bg-[#F4FAFB] disabled:opacity-50 flex items-center gap-3"
                  >
                    <Plus size={14} className="text-[#1F8383] shrink-0" />
                    <span className="text-sm font-bold text-[#1b3f7a] leading-snug flex-1">{r.title}</span>
                    {r.variant_title ? <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#1F8383]">{r.variant_title}</span> : null}
                    {r.is_professional ? <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Profesional</span> : null}
                    {yaEsta.has(String(r.variant_id)) ? <span className="text-[10px] text-[#8AAAB8]">Ya agregado</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="bg-white border border-[#D0E4EC] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#EEF3F7] text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
            {lista.length} productos · en este orden aparecen en la app
          </div>
          {cargando ? (
            <p className="px-5 py-6 text-sm text-[#8AAAB8]">Cargando...</p>
          ) : lista.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[#8AAAB8]">Todavía no hay sugeridos. Mientras esté vacío, el carrito solo muestra los recomendados del profesional.</p>
          ) : (
            <div className="divide-y divide-[#EEF3F7]">
              {lista.map((s, i) => (
                <div key={s.id} className={`flex items-center gap-3 px-5 py-3 ${s.active ? "" : "opacity-50"}`}>
                  <div className="flex flex-col">
                    <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-[#5B7A8C] disabled:opacity-30" aria-label="Subir"><ArrowUp size={14} /></button>
                    <button onClick={() => mover(i, 1)} disabled={i === lista.length - 1} className="text-[#5B7A8C] disabled:opacity-30" aria-label="Bajar"><ArrowDown size={14} /></button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1b3f7a] leading-snug">{s.title}</p>
                    <input
                      defaultValue={s.note ?? ""}
                      maxLength={80}
                      placeholder="Texto corto (opcional): Ideal para dormir mejor"
                      onBlur={(e) => { if ((e.target.value || null) !== (s.note || null)) llamar("PATCH", { id: s.id, note: e.target.value }); }}
                      className="mt-1 w-full text-xs text-[#5B7A8C] border border-transparent hover:border-[#D0E4EC] focus:border-[#2BB9B8] rounded-lg px-2 py-1 focus:outline-none"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[#5B7A8C] cursor-pointer select-none">
                    <input type="checkbox" checked={s.active} onChange={(e) => llamar("PATCH", { id: s.id, active: e.target.checked })} />
                    Activo
                  </label>
                  <button onClick={() => llamar("DELETE", null, `?id=${s.id}`)} className="text-[#8AAAB8] hover:text-red-500" aria-label="Quitar">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
