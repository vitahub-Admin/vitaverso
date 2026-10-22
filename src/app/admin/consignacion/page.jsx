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
  // Paquete: varios productos que se registran juntos con un solo botón
  const [paquete, setPaquete] = useState([]);   // [{ variant_id, title, variant_title, sku, cantidad }]

  // Stock
  const [stock, setStock] = useState([]);
  const [cargandoStock, setCargandoStock] = useState(false);

  // Resumen: quién tiene producto en su consultorio, para no tener que buscarlo
  const [resumen, setResumen] = useState(null);

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

  // Todos los que tienen o tuvieron consignación, con sus totales
  const cargarResumen = async () => {
    try {
      const r = await fetch("/api/admin/consignment");
      const d = await r.json();
      if (!d.ok) { setResumen([]); return; }
      const por = new Map();
      for (const i of d.items) {
        const g = por.get(i.owner_id) || {
          id: i.owner_id, first_name: i.owner_first_name || i.owner_name || "", last_name: i.owner_last_name || "",
          email: i.owner_email, productos: 0, disponible: 0, vendido: 0, entregado: 0, actualizado: null,
        };
        if ((i.disponible || 0) > 0) g.productos += 1;
        g.disponible += Math.max(0, i.disponible || 0);
        g.vendido    += i.vendido || 0;
        g.entregado  += i.entregado || 0;
        if (!g.actualizado || new Date(i.updated_at) > new Date(g.actualizado)) g.actualizado = i.updated_at;
        por.set(i.owner_id, g);
      }
      setResumen([...por.values()].sort((a, b) => b.disponible - a.disponible));
    } catch { setResumen([]); }
  };

  // Se vuelve a leer al entrar y cada vez que se regresa a la lista (después de un movimiento)
  useEffect(() => { if (!profesional) cargarResumen(); }, [profesional]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalUnidades = useMemo(
    () => stock.reduce((a, s) => a + Math.max(0, s.disponible || 0), 0), [stock]);

  // ── Paquete ──────────────────────────────────────────────────────────
  const unidadesPaquete = paquete.reduce((a, l) => a + Number(l.cantidad || 0), 0);

  const agregarAlPaquete = () => {
    const n = Number(cantidad);
    if (!variante || !Number.isFinite(n) || n === 0) { mostrar("Elige un producto y una cantidad", true); return; }
    setPaquete((p) => {
      const ya = p.find((l) => l.variant_id === variante.variant_id);
      if (ya) return p.map((l) => l.variant_id === variante.variant_id ? { ...l, cantidad: Number(l.cantidad) + n } : l);
      return [...p, { variant_id: variante.variant_id, title: variante.title, variant_title: variante.variant_title, sku: variante.sku, cantidad: n }];
    });
    setVariante(null); setBusquedaProd(""); setCantidad("");
  };

  const cambiarCantidad = (id, valor) =>
    setPaquete((p) => p.map((l) => l.variant_id === id ? { ...l, cantidad: valor } : l));
  const quitarDelPaquete = (id) => setPaquete((p) => p.filter((l) => l.variant_id !== id));

  // Lo que se va a registrar: el paquete, más el producto que esté elegido y no se haya agregado
  const lineasPendientes = () => {
    const lineas = paquete.map((l) => ({ variant_id: l.variant_id, cantidad: Number(l.cantidad) }));
    const n = Number(cantidad);
    if (variante && Number.isFinite(n) && n !== 0) lineas.push({ variant_id: variante.variant_id, cantidad: n });
    return lineas;
  };
  const hayAlgo = paquete.length > 0 || (variante && Number(cantidad));

  // ── Guardar movimiento ──────────────────────────────────────────────
  const guardar = async () => {
    const lineas = lineasPendientes();
    if (!profesional || !lineas.length) { mostrar("Falta el profesional o los productos", true); return; }
    if (lineas.some((l) => !Number.isFinite(l.cantidad) || l.cantidad === 0)) {
      mostrar("Hay un producto sin cantidad", true); return;
    }

    setGuardando(true);
    try {
      const r = await fetch("/api/admin/consignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_id: profesional.shopify_customer_id, tipo, motivo, lineas }),
      });
      const d = await r.json();
      if (!d.ok) { mostrar(d.error || "No se pudo guardar", true); return; }

      const unidades = d.items.reduce((a, i) => a + Math.abs(i.cantidad), 0);
      const base = `${TIPOS.find(t => t.key === tipo).label} registrada · ${d.items.length} ${d.items.length === 1 ? "producto" : "productos"}, ${unidades} unidades`;
      if (d.baselinker && !d.baselinker.ok) {
        mostrar(`${base}. OJO: el libro quedó bien pero BaseLinker no lo movió (${d.baselinker.motivo || "sin detalle"}); hay que corregirlo a mano.`, true);
      } else {
        mostrar(base);
      }
      setPaquete([]); setVariante(null); setBusquedaProd(""); setCantidad(""); setMotivo("");
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
                className="w-full border border-[#D0E4EC] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#2BB9B8]"
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

        {/* ── Quién tiene consignación ── */}
        {!profesional && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-3">
              Profesionales con producto en su consultorio
            </p>
            {resumen === null && <p className="text-sm text-gray-400">Cargando…</p>}
            {resumen && resumen.length === 0 && (
              <p className="text-sm text-gray-400">Todavía nadie tiene consignación. Busca a un profesional arriba para registrar su primera entrega.</p>
            )}
            {resumen && resumen.length > 0 && (
              <div className="divide-y divide-gray-100">
                {resumen.map((g) => (
                  <button key={g.id}
                    onClick={() => setProfesional({ shopify_customer_id: g.id, first_name: g.first_name, last_name: g.last_name, email: g.email })}
                    className="w-full text-left py-3 flex items-center gap-3 hover:bg-[#F7F9FB] rounded-lg px-2 -mx-2 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-[#1b3f7a] text-white flex items-center justify-center font-bold shrink-0">
                      {(g.first_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#1b3f7a] truncate">{g.first_name} {g.last_name}</p>
                      <p className="text-xs text-[#8AAAB8] truncate">{g.email || `ID ${g.id}`}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-extrabold tabular-nums ${g.disponible > 0 ? "text-[#1F8383]" : "text-[#B0C8D4]"}`}>
                        {g.disponible} {g.disponible === 1 ? "unidad" : "unidades"}
                      </p>
                      <p className="text-[11px] text-[#8AAAB8] tabular-nums">
                        {g.productos} {g.productos === 1 ? "producto" : "productos"} · {g.vendido} vendidas
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Movimiento ── */}
        {profesional && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 space-y-4">
            <div className="flex gap-2">
              {TIPOS.map((t) => (
                <button key={t.key} onClick={() => setTipo(t.key)}
                  title={t.desc}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    tipo === t.key ? "bg-[#1b3f7a] text-white"
                                   : "bg-white border border-[#D0E4EC] text-[#5B7A8C] hover:border-[#2BB9B8]"}`}>
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
                    <p className="text-[11px] text-[#1F8383] font-semibold uppercase tracking-widest mt-0.5">
                      {variante.variant_title} · {fmtMXN(variante.price)}
                      {variante.sku && <span className="ml-2 normal-case tracking-normal font-mono text-[#5B7A8C]">{variante.sku}</span>}
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
                    placeholder="Buscar producto por nombre o SKU…"
                    className="w-full border border-[#D0E4EC] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#2BB9B8]"
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
                                className="text-[11px] font-semibold border border-[#D0E4EC] rounded-full px-2.5 py-1 hover:border-[#2BB9B8] hover:text-[#1F8383] text-[#5B7A8C]">
                                {v.variant_title || "Único"}
                                {v.sku && <span className="font-mono font-normal text-[#8AAAB8]"> · {v.sku}</span>}
                                {" "}· {fmtMXN(v.price)}
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
                  className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#2BB9B8]"
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
                  className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#2BB9B8]"
                />
              </div>
            </div>

            {/* Agregar el producto elegido al paquete */}
            <button
              onClick={agregarAlPaquete}
              disabled={!variante || !Number(cantidad)}
              className="w-full border border-[#2BB9B8] text-[#1F8383] bg-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#EAF8F8] transition-colors disabled:opacity-40 disabled:hover:bg-white">
              + Agregar al paquete
            </button>

            {/* Paquete: todo lo que se registra junto */}
            {paquete.length > 0 && (
              <div className="border border-[#C2DFE8] rounded-xl overflow-hidden">
                <div className="px-3.5 py-2 bg-[#F4FAFB] border-b border-[#C2DFE8] flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Paquete a registrar</span>
                  <span className="text-xs text-[#1F8383] font-semibold tabular-nums">
                    {paquete.length} {paquete.length === 1 ? "producto" : "productos"} · {unidadesPaquete} unidades
                  </span>
                </div>
                {paquete.map((l) => (
                  <div key={l.variant_id} className="px-3.5 py-2.5 flex items-center gap-3 border-b border-[#EEF3F7] last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#1b3f7a] leading-snug line-clamp-1">{l.title}</p>
                      <p className="text-[11px] text-[#5B7A8C] mt-0.5">
                        {l.variant_title || "Único"}
                        {l.sku && <span className="font-mono text-[#8AAAB8]"> · {l.sku}</span>}
                      </p>
                    </div>
                    <input
                      type="number"
                      value={l.cantidad}
                      onChange={(e) => cambiarCantidad(l.variant_id, e.target.value)}
                      className="w-16 border border-[#D0E4EC] rounded-lg px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:border-[#2BB9B8]"
                    />
                    <button onClick={() => quitarDelPaquete(l.variant_id)} className="text-[#8AAAB8] hover:text-[#1b3f7a]" title="Quitar">
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={guardar}
              disabled={guardando || !hayAlgo}
              className="w-full bg-[#1b3f7a] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#162d60] transition-colors disabled:opacity-40">
              {guardando ? "Guardando…" : `Registrar ${TIPOS.find(t => t.key === tipo).label.toLowerCase()}${paquete.length > 1 ? ` · ${paquete.length} productos` : ""}`}
            </button>
          </div>
        )}

        {/* ── Stock actual ── */}
        {profesional && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#EEF3F7] flex items-center gap-2">
              <Package size={15} className="text-[#1F8383]" />
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
                          <p className="text-[11px] text-[#1F8383] font-semibold uppercase tracking-widest mt-0.5">
                            {s.variant_title}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#5B7A8C]">{s.entregado}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#5B7A8C]">{s.vendido}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#5B7A8C]">{s.devuelto}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#5B7A8C]">{s.ajuste || 0}</td>
                      <td className={`px-5 py-3 text-right tabular-nums font-extrabold ${
                        s.disponible > 0 ? "text-[#1F8383]" : "text-[#B0C8D4]"}`}>
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
