"use client";

/**
 * Cobro en efectivo para profesionales con producto en consignación (prototipo).
 *
 * El profesional entrega producto de su consultorio y cobra en mano, como punto de venta.
 * Cada cobro se suma a un carrito de "efectivo por liquidar". Al cerrar el día lo paga completo
 * por Shopify: recién entonces se cierran las ventas, baja el inventario, se mueve BaseLinker y
 * se acredita su comisión. Esta pantalla muestra ese carrito y lleva al pago.
 *
 * Se paga y se consulta desde el panel de "Ventas locales" (/ventas-locales).
 *
 * Por ahora solo funciona en modo tester (ver src/lib/consignacionTester.js): las ventas viven
 * en la memoria del servidor local y el checkout es el simulador.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Banknote, Check, TriangleAlert, ExternalLink } from "lucide-react";

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 })
    .format(Number(n) || 0);

const hora = (iso) => new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
const esDeHoy = (iso) => new Date(iso).toDateString() === new Date().toDateString();
const diaCorto = (iso) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

const VACIO = { pendientes: [], liquidadas: [], totales: { ventas: 0, a_pagar: 0, comision: 0 }, pago: null, fantasma: false, modoSandbox: false };

// ── Datos ─────────────────────────────────────────────────────────────────────
export function useEfectivo(habilitado) {
  const [datos, setDatos] = useState(VACIO);

  // Huella de lo último que se vio: el aviso al menú lateral y a la página de Ventas locales solo sale
  // cuando algo cambió. Sin esto, cada revisión mientras se espera un pago disparaba otras tres consultas.
  const huella = useRef(null);

  const guardar = (d) => {
    setDatos({ pendientes: d.pendientes, liquidadas: d.liquidadas, totales: d.totales, pago: d.pago || null, fantasma: Boolean(d.fantasma), modoSandbox: Boolean(d.sandbox) });
    const nueva = JSON.stringify([d.pendientes.map((v) => v.id), d.liquidadas.length, d.pago?.id || null]);
    if (huella.current !== null && huella.current !== nueva && typeof window !== "undefined") {
      // El menú lateral muestra un punto rojo si hay ventas por pagar: se entera por aquí
      window.dispatchEvent(new Event("ventas-locales:cambio"));
    }
    huella.current = nueva;
  };

  const refrescar = useCallback(async () => {
    if (!habilitado) return;
    try {
      const d = await (await fetch("/api/consignment/efectivo")).json();
      if (d.ok) guardar(d);
    } catch {}
  }, [habilitado]);

  useEffect(() => { refrescar(); }, [refrescar]);

  const llamar = async (ruta, cuerpo) => {
    try {
      const r = await fetch(ruta, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo || {}),
      });
      const d = await r.json();
      if (d.ok) guardar(d);
      return d;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  return {
    habilitado,
    ...datos,
    refrescar,
    registrar: (cuerpo) => llamar("/api/consignment/efectivo", cuerpo),
    generarPago: () => llamar("/api/consignment/efectivo/liquidar"),
    simularPago: () => llamar("/api/consignment/efectivo/simular-pago"),
  };
}

// ── Botón de la barra superior ────────────────────────────────────────────────
export function EfectivoPill({ efectivo }) {
  if (!efectivo.habilitado) return null;
  const { ventas, a_pagar } = efectivo.totales;
  const atrasado = efectivo.pendientes.some((v) => !esDeHoy(v.created_at));
  return (
    <Link
      href="/ventas-locales"
      className={`relative flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-colors ${
        ventas > 0
          ? "border-[#2BB9B8] bg-[#EAF8F8] text-[#1F8383] hover:bg-[#D5F1F1]"
          : "border-[#D0E4EC] bg-white text-[#5B7A8C] hover:border-[#2BB9B8]"}`}
    >
      <Banknote size={15} />
      <span className="hidden sm:inline">Ventas locales</span>
      {ventas > 0 && <span className="tabular-nums">{fmtMXN(a_pagar)}</span>}
      {atrasado && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#F59E0B] border-2 border-white"
          title="Tienes efectivo de días anteriores sin pagar" />
      )}
    </Link>
  );
}

// ── Panel con el carrito acumulado ────────────────────────────────────────────
// Vive en la página de Ventas locales. Muestra lo cobrado en efectivo y todavía sin pagar, y
// lleva al pago: al pagarlo se cierran las ventas, baja el inventario y se acredita la comisión.
export function PanelEfectivo({ efectivo }) {
  const [generando, setGenerando]     = useState(false);
  const [error, setError]             = useState("");
  const [esperando, setEsperando]     = useState(null);   // totales con los que se generó el pago
  const [recien, setRecien]           = useState(null);   // lo que se acaba de liquidar
  const [verHistorial, setVerHistorial] = useState(false);
  const [simulando, setSimulando]   = useState(false);

  // Mientras el pago está abierto, se revisa si ya se pagó. Cuando el carrito queda vacío, se liquidó.
  // Se revisa cada 5 segundos, solo con la pestaña a la vista, y a los 10 minutos deja de insistir:
  // para entonces el botón "Ya pagué, revisar" hace la consulta cuando se necesite.
  const [sinInsistir, setSinInsistir] = useState(false);
  useEffect(() => {
    if (!esperando) return;
    setSinInsistir(false);
    const inicio = Date.now();
    const t = setInterval(() => {
      if (Date.now() - inicio > 10 * 60 * 1000) { clearInterval(t); setSinInsistir(true); return; }
      if (typeof document !== "undefined" && document.hidden) return;
      efectivo.refrescar();
    }, 5000);
    return () => clearInterval(t);
  }, [esperando]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (esperando && efectivo.pendientes.length === 0) { setRecien(esperando); setEsperando(null); }
  }, [efectivo.pendientes.length, esperando]);

  const { pendientes, liquidadas, totales, pago } = efectivo;
  const atrasado = pendientes.some((v) => !esDeHoy(v.created_at));
  const sinCorreo = pendientes.filter((v) => !v.patient_email).length;
  const sinEnviar = pendientes.filter((v) => v.patient_email && !v.protocolo_enviado_at).length;

  // Solo pruebas del equipo: cierra la liquidación sin Shopify
  const simular = async () => {
    setSimulando(true); setError("");
    const r = await efectivo.simularPago();
    setSimulando(false);
    if (!r.ok) setError(r.error || "No se pudo simular el pago");
  };

  const pagar = async () => {
    setGenerando(true); setError(""); setRecien(null);
    const r = await efectivo.generarPago();
    setGenerando(false);
    if (!r.ok) { setError(r.error || "No se pudo generar el pago"); return; }
    setEsperando(r.totales);
    window.open(r.payment_url, "_blank");
  };

  return (
    <div className="space-y-4">
      {recien && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
          <p className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
            <Check size={14} /> Pagado · {fmtMXN(recien.a_pagar)}
          </p>
          <p className="text-[11px] text-emerald-600 mt-0.5 leading-snug">
            Se cerraron {recien.ventas} {recien.ventas === 1 ? "venta" : "ventas"} y se acreditó tu comisión de {fmtMXN(recien.comision)}.
            {efectivo.fantasma ? " (Prueba: no se movió inventario ni dinero, y no se acreditó comisión.)" : ""}
          </p>
        </div>
      )}

      {atrasado && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
          <TriangleAlert size={15} className="text-[#F59E0B] shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-800 leading-snug">Tienes efectivo de días anteriores sin pagar.</p>
        </div>
      )}

      {pendientes.length === 0 ? (
        <div className="bg-white border border-[#D0E4EC] rounded-2xl text-center py-10 px-5">
          <p className="text-sm font-semibold text-[#1b3f7a]">No tienes ventas por pagar</p>
          <p className="text-xs text-[#8AAAB8] mt-1 leading-snug max-w-[290px] mx-auto">
            Cuando cobres un protocolo en efectivo desde tu consultorio, la venta se suma aquí hasta que la pagues.
          </p>
        </div>
      ) : (
        <>
          {/* Resumen y pago */}
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 space-y-2.5">
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-bold text-[#1b3f7a]">
                Por pagar · {totales.ventas} {totales.ventas === 1 ? "venta" : "ventas"}
              </span>
              <span className="text-2xl font-extrabold text-[#1b3f7a] tabular-nums">{fmtMXN(totales.a_pagar)}</span>
            </div>
            <div className="flex justify-between text-[13px] pt-2.5 border-t border-[#EEF3F7]">
              <span className="text-[#5B7A8C]">Tu comisión al pagar</span>
              <span className="tabular-nums font-semibold text-[#1F8383]">+ {fmtMXN(totales.comision)}</span>
            </div>
            <p className="text-[11px] text-[#8AAAB8] leading-snug">
              Cuando pagues, se cierran las ventas, se descuenta tu inventario y la comisión se acredita en tu wallet.
              {sinCorreo > 0 && ` ${sinCorreo} ${sinCorreo === 1 ? "venta no tiene" : "ventas no tienen"} correo: ese paciente no recibió su protocolo.`}
              {sinEnviar > 0 && !efectivo.modoSandbox && ` ${sinEnviar} ${sinEnviar === 1 ? "protocolo no se pudo enviar" : "protocolos no se pudieron enviar"}; se reintenta al pagar.`}
            </p>

            {error && <p className="text-xs text-red-500">{error}</p>}
            {esperando && pago ? (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-[#5B7A8C] leading-snug">
                  Esperando tu pago de <span className="font-bold text-[#1b3f7a]">{fmtMXN(esperando.a_pagar)}</span>. Se abrió en otra pestaña;
                  {sinInsistir ? " ya no se revisa solo: toca \"Ya pagué, revisar\"." : " en cuanto lo pagues, esto se actualiza solo."}
                </p>
                <div className="flex gap-2">
                  <a href={pago.payment_url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#1b3f7a] text-white text-sm py-2.5 rounded-lg font-semibold hover:bg-[#162d60] transition-colors">
                    <ExternalLink size={14} /> Abrir el pago
                  </a>
                  <button onClick={pagar} disabled={generando}
                    className="px-3.5 border border-[#D0E4EC] text-[#5B7A8C] text-sm rounded-lg font-semibold hover:bg-white transition-colors disabled:opacity-50"
                    title="Rehacer el pago si agregaste ventas nuevas">
                    {generando ? "…" : "Rehacer"}
                  </button>
                </div>
                <button onClick={() => efectivo.refrescar()}
                  className="w-full text-[12px] font-semibold text-[#1F8383] hover:underline">
                  Ya pagué, revisar
                </button>
              </div>
            ) : (
              <button onClick={pagar} disabled={generando}
                className="w-full bg-[#1b3f7a] text-white text-sm py-3 rounded-xl font-semibold hover:bg-[#162d60] transition-colors disabled:opacity-50 mt-1">
                {generando ? "Generando el pago…" : `Pagar ${fmtMXN(totales.a_pagar)}`}
              </button>
            )}
            {efectivo.fantasma && pago && (
              <div className="pt-1">
                <button onClick={simular} disabled={simulando}
                  className="w-full border border-dashed border-[#F59E0B] text-[#B45309] bg-[#FFFBEB] text-xs py-2 rounded-lg font-semibold hover:bg-amber-100 transition-colors disabled:opacity-50">
                  {simulando ? "Cerrando…" : "Simular el pago (solo pruebas)"}
                </button>
                <p className="text-[10px] text-[#B0C8D4] text-center leading-snug mt-1.5">
                  Cierra las ventas sin cobrar nada ni mover inventario. Los protocolos ya salieron al cobrar.
                </p>
              </div>
            )}
            {efectivo.modoSandbox && (
              <p className="text-[10px] text-[#B0C8D4] text-center leading-snug">
                Modo de prueba: nada se cobra ni se guarda de verdad; el pago es el simulador.
              </p>
            )}
          </div>

          {/* Las ventas, como un carrito que se va llenando */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2">Ventas por pagar</p>
            <div className="space-y-2.5">
              {pendientes.map((v) => <FilaVenta key={v.id} venta={v} />)}
            </div>
          </div>
        </>
      )}

      {liquidadas.length > 0 && (
        <div>
          <button onClick={() => setVerHistorial((x) => !x)}
            className="text-[11px] font-semibold text-[#1F8383] hover:underline">
            {verHistorial ? "Ocultar" : "Ver"} ya pagadas ({liquidadas.length})
          </button>
          {verHistorial && (
            <div className="space-y-2.5 mt-2.5 opacity-70">
              {liquidadas.map((v) => <FilaVenta key={v.id} venta={v} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilaVenta({ venta }) {
  return (
    <div className="border border-[#EEF3F7] rounded-xl p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold text-[#1b3f7a] truncate">{venta.patient_name || "Paciente sin nombre"}</p>
        <p className="text-[11px] text-[#8AAAB8] shrink-0">
          {esDeHoy(venta.created_at) ? `Hoy ${hora(venta.created_at)}` : `${diaCorto(venta.created_at)} ${hora(venta.created_at)}`}
        </p>
      </div>
      {venta.patient_email && <p className="text-[11px] text-[#8AAAB8] truncate">{venta.patient_email}</p>}
      <div className="mt-2 space-y-1.5">
        {venta.items.map((i) => (
          <div key={i.variant_id} className="flex items-center gap-2.5">
            {i.image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={i.image} alt="" className="w-8 h-8 rounded-md border border-[#D0E4EC] object-cover shrink-0" />
              : <div className="w-8 h-8 rounded-md border border-[#D0E4EC] bg-[#F7F9FB] shrink-0" />}
            <p className="text-[11px] text-[#5B7A8C] leading-snug flex-1 min-w-0 line-clamp-2">
              {i.title}{i.variant_title ? ` · ${i.variant_title}` : ""}
            </p>
            <p className="text-[11px] tabular-nums text-[#1b3f7a] font-semibold shrink-0">
              {i.quantity} × {fmtMXN(i.price)}
            </p>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 pt-2 border-t border-[#EEF3F7] text-[11px]">
        <span className="text-[#8AAAB8]">Cobrado en efectivo</span>
        <span className="font-bold text-[#1b3f7a] tabular-nums">{fmtMXN(venta.total)}</span>
      </div>
    </div>
  );
}

// ── Ventana para registrar un cobro en efectivo ───────────────────────────────
// items: lo que se entrega hoy en mano, [{ variant_id, title, variant_title, price, quantity }]
export function CobroEfectivoModal({ items, patientName, patientPhone, patientEmail, extra, onRegistrar, onClose }) {
  const [paso, setPaso]         = useState("confirmar");   // confirmar | listo
  const [cargando, setCargando] = useState(false);
  const [error, setError]       = useState("");
  const [venta, setVenta]       = useState(null);
  const [enSandbox, setEnSandbox] = useState(false);
  const [correo, setCorreo]     = useState(patientEmail || "");

  const total = items.reduce((a, i) => a + (Number(i.price) || 0) * (i.quantity || 1), 0);

  const confirmar = async () => {
    setCargando(true); setError("");
    const r = await onRegistrar({
      items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity || 1 })),
      patient_name: patientName || null,
      patient_phone: patientPhone || null,
      patient_email: correo.trim() || null,
      ...(extra || {}),
    });
    setCargando(false);
    if (!r.ok) { setError(r.error || "No se pudo registrar el cobro"); return; }
    setVenta(r.venta);
    setEnSandbox(Boolean(r.sandbox));
    setPaso("listo");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(13,33,51,0.72)]"
      onClick={() => !cargando && onClose(paso === "listo")}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {paso === "confirmar" ? (
          <>
            <h3 className="text-base font-extrabold text-[#1b3f7a] flex items-center gap-2">
              <Banknote size={17} className="text-[#1F8383]" /> Cobro en efectivo
            </h3>
            <p className="text-xs text-[#5B7A8C] mt-1.5 leading-snug">
              Cobras tú al paciente en mano. La venta se suma a tus ventas por pagar: al cerrar el día las pagas desde el
              panel de "Ventas locales", y ahí se descuenta tu inventario y se acredita tu comisión.
            </p>

            <div className="mt-3.5 border border-[#EEF3F7] rounded-xl divide-y divide-[#EEF3F7] max-h-60 overflow-y-auto">
              {items.map((i) => (
                <div key={i.variant_id} className="flex items-center gap-3 px-3 py-2.5">
                  <p className="text-xs text-[#1b3f7a] leading-snug flex-1 min-w-0 line-clamp-2">{i.title}</p>
                  <p className="text-xs tabular-nums text-[#5B7A8C] shrink-0">
                    {i.quantity || 1} × {fmtMXN(i.price)}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-baseline mt-3">
              <span className="text-sm text-[#5B7A8C]">Cobra al paciente</span>
              <span className="text-xl font-extrabold text-[#1b3f7a] tabular-nums">{fmtMXN(total)}</span>
            </div>
            {patientName && <p className="text-[11px] text-[#8AAAB8] mt-1">Paciente: {patientName}</p>}

            <div className="mt-3.5">
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-1.5">Correo del paciente</label>
              <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="off"
                placeholder="paciente@ejemplo.com"
                className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#2BB9B8]" />
              <p className="text-[11px] text-[#8AAAB8] mt-1 leading-snug">
                Ahí le llega su protocolo con las indicaciones en cuanto registres el cobro. Sin correo, no lo recibe.
              </p>
            </div>
            {error && <p className="text-xs text-red-500 mt-2.5 leading-snug">{error}</p>}

            <div className="flex gap-2 mt-4">
              <button onClick={() => onClose(false)} disabled={cargando}
                className="flex-1 border border-[#D0E4EC] text-[#5B7A8C] text-sm py-2.5 rounded-lg font-semibold hover:bg-[#F7F9FB] transition-colors">
                Cancelar
              </button>
              <button onClick={confirmar} disabled={cargando}
                className="flex-1 bg-[#2BB9B8] text-[#0D2133] text-sm py-2.5 rounded-lg font-semibold hover:bg-[#26A3A2] transition-colors disabled:opacity-50">
                {cargando ? "Registrando…" : "Ya cobré en efectivo"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-11 h-11 rounded-full bg-emerald-50 flex items-center justify-center">
              <Check size={20} className="text-emerald-600" />
            </div>
            <h3 className="text-base font-extrabold text-[#1b3f7a] mt-3">Cobro registrado</h3>
            <p className="text-xs text-[#5B7A8C] mt-1 leading-snug">Ya le puedes entregar los productos al paciente.</p>
            <div className="mt-3.5 border border-[#D0E4EC] rounded-xl p-3.5 space-y-1.5 text-sm">
              <div className="flex justify-between text-[#5B7A8C]">
                <span>Cobraste en efectivo</span>
                <span className="tabular-nums font-semibold text-[#1b3f7a]">{fmtMXN(venta.total)}</span>
              </div>
              <div className="flex justify-between text-[#5B7A8C]">
                <span>Tu comisión al pagar</span>
                <span className="tabular-nums font-semibold text-[#1F8383]">+ {fmtMXN(venta.comision)}</span>
              </div>
              <p className="text-[11px] text-[#8AAAB8] leading-snug pt-1.5 border-t border-[#EEF3F7]">
                Se sumó a tus ventas por pagar. La ves en "Ventas locales".
                {!venta.patient_email
                  ? " No capturaste correo: no recibirá su protocolo por correo."
                  : enSandbox
                    ? ` (Prueba local: el correo a ${venta.patient_email} no se envía.)`
                    : venta.protocolo_enviado_at
                      ? ` Ya le enviamos su protocolo a ${venta.patient_email}.`
                      : ` No se pudo enviar el protocolo a ${venta.patient_email}; se reintenta cuando pagues tus ventas.`}
              </p>
            </div>
            <button onClick={() => onClose(true)}
              className="w-full mt-4 bg-[#1b3f7a] text-white text-sm py-2.5 rounded-lg font-semibold hover:bg-[#162d60] transition-colors">
              Listo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
