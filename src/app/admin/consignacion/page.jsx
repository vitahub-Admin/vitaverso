"use client";

/**
 * Consignación: qué producto tiene cada profesional en su consultorio.
 *
 * Acá se cargan las entregas (lo que se le manda), las devoluciones (lo que
 * vuelve al CEDIS) y los ajustes (conteos y mermas). Las ventas NO se cargan
 * a mano: las escribe el cobro cuando el pago se confirma, así no hay forma
 * de descontar stock sin que haya entrado el dinero.
 *
 * Vive bajo /admin porque el proxy exige sesión de administrador.
 */

import { useEffect, useState, useMemo } from "react";
import { affiliatesService } from "../../services/affiliates";
import { Package, Search, Plus, Minus, Settings2, X } from "lucide-react";

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const TIPOS = [
  { key: "entrega",    label: "Entrega",    desc: "Se le manda producto al consultorio", icon: Plus },
  { key: "devolucion", label: "Devolución", desc: "Vuelve al CEDIS",                     icon: Minus },
  { key: "ajuste",     label: "Ajuste",     desc: "Conteo o merma (puede ser negativo)", icon: Settings2 },
];

export default function ConsignacionPage() {
  const [aviso, setAviso] = useState(null);         // { texto, error }

  // Profesional
  const [busquedaPro, setBusquedaPro] = useState("");
  const [profesionales, setProfesionales] = useState([]);
  const [profesional, setProfesional] = useState(null);
  const [buscandoPro, setBuscandoPro] = useState(false);

  // Producto
  const [busquedaProd, setBusquedaProd] = useState("");
  const [productos, setProductos] = useState([]);
  const [buscandoProd, setBuscandoProd] = useState(false);
  const [variante, setVariante] = useState(null);    // { variant_id, title, variant_title, price }

  // Movimiento
  const [tipo, setTipo] = useState("entrega");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Stock
  const [stock, setStock] = useState([]);
  const [cargandoStock, setCargandoStock] = useState(false);

  const mostrar = (texto, error = false) => {
    setAviso({ texto, error });
    setTimeout(() => setAviso(null), 5000);
  };

  // ── Buscar profesional ──────────────────────────────────────────────
  useEffect(() => {
    if (!busquedaPro || profesional) { setProfesionales([]); return; }
    const t = setTimeout(async () => {
      try {
        setBuscandoPro(true);
        const r = await affiliatesService.getAll({ search: busquedaPro, searchField: "all", limit: 15, status: "" });
        setProfesionales(r?.data || r?.affiliates || []);
      } catch { setProfesionales([]); }
      finally { setBuscandoPro(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [busquedaPro, profesional]);

  // ── Buscar producto ─────────────────────────────────────────────────
  useEffect(() => {
    const q = busquedaProd.trim();
    if (q.length < 3 || variante) { setProductos([]); return; }
    const t = setTimeout(async () => {
      try {
        setBuscandoProd(true);
        const r = await fetch(`/api/product-catalog?search=${encodeURIComponent(q)}`);
        const d = await r.json();
        setProductos((d.items || []).slice(0, 8));
      } catch { setProductos([]); }
      finally { setBuscandoProd(false); }
    }, 500);
    return () => clearTimeout(t);
  }, [busquedaProd, variante]);

  // ── Stock del profesional elegido ───────────────────────────────────
  const cargarStock = async (ownerId) => {
    if (!ownerId) return;
    setCargandoStock(true);
    try {
      const r = await fetch(`/api/admin/consignment?owner_id=${ownerId}`);
      const d = await r.json();
      setStock(d.ok ? d.items : []);
    } catch { setStock([]); }
    finally { setCargandoStock(false); }
  };

  useEffect(() => {
    if (profesional) cargarStock(profesional.shopify_customer_id);
    else setStock([]);
  }, [profesional]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalUnidades = useMemo(
    () => stock.reduce((a, s) => a + Math.max(0, s.disponible || 0), 0), [stock]);

  // ── Guardar movimiento ──────────────────────────────────────────────
  const guardar = async () => {
    if (!profesional || !variante || !cantidad) {
      mostrar("Falta el profesional, el producto o la cantidad", true);
      return;
    }
    const n = Number(cantidad);
    if (!Number.isFinite(n) || n === 0) { mostrar("Cantidad inválida", true); return; }

    setGuardando(true);
    try {
      const r = await fetch("/api/admin/consignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id:   profesional.shopify_customer_id,
          variant_id: variante.variant_id,
          tipo,
          cantidad:   n,
          motivo,
        }),
      });
      const d = await r.json();
      if (!d.ok) { mostrar(d.error || "No se pudo guardar", true); return; }

      mostrar(`${TIPOS.find(t => t.key === tipo).label} registrada · quedan ${d.stock.disponible} unidades`);
      setVariante(null); setBusquedaProd(""); setCantidad(""); setMotivo("");
      cargarStock(profesional.shopify_customer_id);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FB]">
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="max-w-[1000px] mx-auto py-6">
          <h1 className="text-2xl font-extrabold text-[#1b3f7a] tracking-tight">Consignación</h1>
          <p className="text-sm text-gray-400 font-medium">
            Producto de Vitahub que vive en el consultorio de un profesional
          </p>
        </div>
      </div>

      <div className="max-w-[1000px] mx-auto px-6 py-6 space-y-5">

        {aviso && (
          <div className={`rounded-xl px-4 py-3 text-sm ${
            aviso.error ? "bg-red-50 border border-red-200 text-red-600"
                        : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
            {aviso.texto}
          </div>
        )}

        {/* ── Profesional ── */}
        <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2 block">
            Profesional
          </label>

          {profesional ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#1b3f7a] text-white flex items-center justify-center font-bold">
                {(profesional.first_name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#1b3f7a]">
                  {profesional.first_name} {profesional.last_name}
                </p>
                <p className="text-xs text-[#8AAAB8]">
                  ID {profesional.shopify_customer_id} · {totalUnidades} unidades en su consultorio
                </p>
              </div>
              <button onClick={() => { setProfesional(null); setBusquedaPro(""); }}
                className="text-[#8AAAB8] hover:text-[#1b3f7a]">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B0C8D4]" />
              <input
                value={busquedaPro}
                onChange={(e) => setBusquedaPro(e.target.value)}
                placeholder="Nombre o correo del profesional…"
                className="w-full border border-[#D0E4EC] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#1E8FA8]"
              />
              {busquedaPro && (
                <div className="absolute z-20 bg-white border border-[#D0E4EC] rounded-lg w-full max-h-56 overflow-y-auto shadow-lg mt-1">
                  {buscandoPro && <div className="p-3 text-xs text-gray-400">Buscando…</div>}
                  {!buscandoPro && profesionales.length === 0 && (
                    <div className="p-3 text-xs text-gray-400">Sin resultados</div>
                  )}
                  {profesionales.map((a) => (
                    <button key={a.shopify_customer_id}
                      onClick={() => { setProfesional(a); setBusquedaPro(""); }}
                      className="w-full text-left px-3 py-2 hover:bg-[#F7F9FB] text-sm text-[#1b3f7a]">
                      {a.first_name} {a.last_name}
                      <span className="text-xs text-[#B0C8D4] ml-2">{a.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Movimiento ── */}
        {profesional && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 space-y-4">
            <div className="flex gap-2">
              {TIPOS.map((t) => (
                <button key={t.key} onClick={() => setTipo(t.key)}
                  title={t.desc}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    tipo === t.key ? "bg-[#1b3f7a] text-white"
                                   : "bg-white border border-[#D0E4EC] text-[#5B7A8C] hover:border-[#1E8FA8]"}`}>
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#8AAAB8] -mt-2">{TIPOS.find(t => t.key === tipo).desc}</p>

            {/* Producto */}
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2 block">
                Producto
              </label>
              {variante ? (
                <div className="flex items-center gap-3 border border-[#C2DFE8] bg-[#F4FAFB] rounded-lg px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1b3f7a] leading-snug">{variante.title}</p>
                    <p className="text-[11px] text-[#1E8FA8] font-semibold uppercase tracking-widest mt-0.5">
                      {variante.variant_title} · {fmtMXN(variante.price)}
                    </p>
                  </div>
                  <button onClick={() => setVariante(null)} className="text-[#8AAAB8] hover:text-[#1b3f7a]">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B0C8D4]" />
                  <input
                    value={busquedaProd}
                    onChange={(e) => setBusquedaProd(e.target.value)}
                    placeholder="Buscar producto por nombre…"
                    className="w-full border border-[#D0E4EC] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#1E8FA8]"
                  />
                  {busquedaProd.trim().length >= 3 && (
                    <div className="absolute z-20 bg-white border border-[#D0E4EC] rounded-lg w-full max-h-72 overflow-y-auto shadow-lg mt-1">
                      {buscandoProd && <div className="p-3 text-xs text-gray-400">Buscando…</div>}
                      {!buscandoProd && productos.length === 0 && (
                        <div className="p-3 text-xs text-gray-400">Sin resultados</div>
                      )}
                      {productos.map((p) => (
                        <div key={p.product_id} className="border-b border-[#EEF3F7] last:border-0">
                          <p className="px-3 pt-2 text-xs font-bold text-[#1b3f7a] leading-snug line-clamp-2">
                            {p.title}
                          </p>
                          <div className="px-3 pb-2 pt-1 flex flex-wrap gap-1.5">
                            {(p.variants || []).map((v) => (
                              <button key={v.variant_id}
                                onClick={() => setVariante({ ...v, title: p.title })}
                                className="text-[11px] font-semibold border border-[#D0E4EC] rounded-full px-2.5 py-1 hover:border-[#1E8FA8] hover:text-[#1E8FA8] text-[#5B7A8C]">
                                {v.variant_title || "Único"} · {fmtMXN(v.price)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cantidad + motivo */}
            <div className="flex gap-3">
              <div className="w-28">
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2 block">
                  Unidades
                </label>
                <input
                  type="number"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  placeholder={tipo === "ajuste" ? "±" : "0"}
                  className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E8FA8]"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2 block">
                  Motivo <span className="normal-case font-normal text-[#B0C8D4]">(opcional)</span>
                </label>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej: primera carga, conteo del 24/09, caja dañada"
                  className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E8FA8]"
                />
              </div>
            </div>

            <button
              onClick={guardar}
              disabled={guardando || !variante || !cantidad}
              className="w-full bg-[#1b3f7a] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#162d60] transition-colors disabled:opacity-40">
              {guardando ? "Guardando…" : `Registrar ${TIPOS.find(t => t.key === tipo).label.toLowerCase()}`}
            </button>
          </div>
        )}

        {/* ── Stock actual ── */}
        {profesional && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#EEF3F7] flex items-center gap-2">
              <Package size={15} className="text-[#1E8FA8]" />
              <h2 className="text-sm font-bold text-[#1b3f7a]">En su consultorio</h2>
              <span className="ml-auto text-xs text-[#8AAAB8] tabular-nums">
                {stock.length} {stock.length === 1 ? "producto" : "productos"} · {totalUnidades} unidades
              </span>
            </div>

            {cargandoStock ? (
              <p className="p-5 text-sm text-[#B0C8D4]">Cargando…</p>
            ) : stock.length === 0 ? (
              <p className="p-5 text-sm text-[#5B7A8C]">
                Todavía no tiene nada. Registra una entrega arriba.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#F7F9FB] text-left">
                  <tr className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
                    <th className="px-5 py-2.5">Producto</th>
                    <th className="px-3 py-2.5 text-right">Entregado</th>
                    <th className="px-3 py-2.5 text-right">Vendido</th>
                    <th className="px-3 py-2.5 text-right">Devuelto</th>
                    <th className="px-3 py-2.5 text-right">Ajuste</th>
                    <th className="px-5 py-2.5 text-right">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s) => (
                    <tr key={s.variant_id} className="border-t border-[#EEF3F7]">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-[#1b3f7a] leading-snug line-clamp-2">{s.title}</p>
                        {s.variant_title && (
                          <p className="text-[11px] text-[#1E8FA8] font-semibold uppercase tracking-widest mt-0.5">
                            {s.variant_title}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#5B7A8C]">{s.entregado}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#5B7A8C]">{s.vendido}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#5B7A8C]">{s.devuelto}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#5B7A8C]">{s.ajuste || 0}</td>
                      <td className={`px-5 py-3 text-right tabular-nums font-extrabold ${
                        s.disponible > 0 ? "text-[#1E8FA8]" : "text-[#B0C8D4]"}`}>
                        {s.disponible}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
