"use client";

/**
 * Pago de una venta de consultorio — lo que ve el paciente.
 *
 * Es la pantalla que la profesional le muestra en el celular o le manda por
 * WhatsApp. Mientras no haya pasarela real, los botones simulan el resultado
 * del pago para poder recorrer el flujo completo; cuando entre Stripe, este
 * lugar lo ocupa su checkout y esta página solo muestra el resultado.
 */

import { useEffect, useState, use } from "react";
import { Check, X, Loader2, ShieldCheck, CreditCard } from "lucide-react";

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 })
    .format(Number(n) || 0);

export default function CobroPage({ params }) {
  const { id } = use(params);
  const [venta, setVenta]   = useState(null);
  const [pasarela, setPasarela] = useState(null);   // stripe | mock | no-disponible
  const [error, setError]   = useState(null);
  const [pagando, setPagando] = useState(false);

  // Datos del comprador. El correo es el único que se guarda: sirve para
  // mandarle su compra y las indicaciones de toma. Los de la tarjeta son
  // decorativos — nunca salen del navegador, y cuando entre Stripe los pide
  // su checkout, que es quien puede recibirlos.
  const [datos, setDatos] = useState({
    nombre: "", email: "", calle: "", colonia: "", cp: "", ciudad: "", estado: "",
    tarjeta: "", vence: "", cvc: "",
  });
  const set = (k) => (e) => setDatos(d => ({ ...d, [k]: e.target.value }));

  const cargar = async () => {
    try {
      const r = await fetch(`/api/consignment/sale/${id}`);
      const d = await r.json();
      if (!d.ok) { setError(d.error); return; }
      setVenta(d.venta);
      setPasarela(d.pasarela);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { cargar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const accion = async (accion) => {
    setPagando(true);
    setError(null);
    try {
      const r = await fetch(`/api/consignment/sale/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, email: datos.email || null }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error); return; }
      // La pasarela real tarda un instante; sin esa pausa el mockup se siente
      // falso y no se alcanza a leer el estado de "procesando".
      await new Promise(r => setTimeout(r, 1400));
      await cargar();
    } finally {
      setPagando(false);
    }
  };

  if (error && !venta) {
    return (
      <div className="min-h-screen bg-[#F7F9FB] flex items-center justify-center p-6">
        <div className="bg-white border border-[#D0E4EC] rounded-2xl p-8 text-center max-w-sm">
          <X size={28} className="mx-auto mb-3 text-red-400" />
          <p className="text-sm text-[#5B7A8C]">{error}</p>
        </div>
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="min-h-screen bg-[#F7F9FB] flex items-center justify-center">
        <Loader2 size={22} className="animate-spin text-[#1E8FA8]" />
      </div>
    );
  }

  // Hay envío si alguna línea no se entrega en mano
  const hayEnvio  = (venta.items || []).some(i => i.entrega === "envio");
  const pagado    = venta.estado === "pagado";
  const cancelado = venta.estado === "cancelado";

  return (
    <div className="min-h-screen bg-[#F7F9FB] py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">

        {/* Encabezado */}
        <div className="text-center">
          {/* Texto hasta que haya un logo propio para el paciente: el de PRO
              dice "Profesionales" y esta página no es para ellos. */}
          <p className="text-2xl font-extrabold tracking-tight text-[#1b3f7a] mb-3">vitahub</p>
          {venta.profesional && (
            <p className="text-sm text-[#5B7A8C]">
              Tu compra con <span className="font-bold text-[#1b3f7a]">{venta.profesional}</span>
            </p>
          )}
        </div>

        {/* Estado */}
        {pagado && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-3">
              <Check size={24} />
            </div>
            <p className="text-base font-bold text-emerald-800">Pago confirmado</p>
            <p className="text-xs text-emerald-700 mt-1">
              Ya puedes llevarte tus productos. Te llegará el comprobante.
            </p>
          </div>
        )}

        {cancelado && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <p className="text-base font-bold text-red-700">Pago cancelado</p>
            <p className="text-xs text-red-600 mt-1">Pídele a tu especialista que genere uno nuevo.</p>
          </div>
        )}

        {/* Productos */}
        <div className="bg-white border border-[#D0E4EC] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#EEF3F7]">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
              Tu pedido
            </p>
          </div>
          <div className="divide-y divide-[#EEF3F7]">
            {(venta.items || []).map((it) => (
              <div key={it.variant_id} className="px-5 py-3 flex gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1b3f7a] leading-snug">{it.title}</p>
                  <p className="text-[11px] text-[#8AAAB8] mt-0.5">
                    {it.variant_title ? `${it.variant_title} · ` : ""}{it.quantity} ×  {fmtMXN(it.price)}
                  </p>
                </div>
                <p className="text-sm font-bold text-[#1b3f7a] tabular-nums shrink-0">
                  {fmtMXN(it.price * it.quantity)}
                </p>
              </div>
            ))}
          </div>
          <div className="px-5 py-4 bg-[#F7F9FB] space-y-1.5">
            {hayEnvio && (
              <>
                <div className="flex items-center justify-between text-xs text-[#5B7A8C]">
                  <span>Productos</span>
                  <span className="tabular-nums">{fmtMXN(venta.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#5B7A8C]">
                  <span>Envío</span>
                  <span className={`tabular-nums ${Number(venta.envio) === 0 ? "text-emerald-600 font-semibold" : ""}`}>
                    {Number(venta.envio) === 0 ? "Gratis" : fmtMXN(venta.envio)}
                  </span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-bold text-[#5B7A8C]">Total</span>
              <span className="text-xl font-extrabold text-[#1b3f7a] tabular-nums">{fmtMXN(venta.total)}</span>
            </div>
          </div>
        </div>

        {/* Pago */}
        {!pagado && !cancelado && pasarela === 'no-disponible' && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 text-center">
            <p className="text-sm font-bold text-[#1b3f7a]">El cobro todavía no está habilitado</p>
            <p className="text-xs text-[#5B7A8C] mt-1 leading-relaxed">
              Tu especialista va a contactarte para completar el pago.
            </p>
          </div>
        )}

        {!pagado && !cancelado && pasarela === 'mock' && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2">Tus datos</p>
              <div className="space-y-2">
                <input value={datos.nombre} onChange={set("nombre")} placeholder="Nombre completo"
                  className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                <input value={datos.email} onChange={set("email")} type="email" placeholder="Correo electrónico"
                  className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                <p className="text-[10px] text-[#B0C8D4]">Ahí te llega tu compra y las indicaciones de toma.</p>
              </div>
            </div>

            {hayEnvio && (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2">Dirección de envío</p>
                <div className="space-y-2">
                  <input value={datos.calle} onChange={set("calle")} placeholder="Calle y número"
                    className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={datos.colonia} onChange={set("colonia")} placeholder="Colonia"
                      className="border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                    <input value={datos.cp} onChange={set("cp")} inputMode="numeric" placeholder="Código postal"
                      className="border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={datos.ciudad} onChange={set("ciudad")} placeholder="Ciudad"
                      className="border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                    <input value={datos.estado} onChange={set("estado")} placeholder="Estado"
                      className="border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2 flex items-center gap-1.5">
                <CreditCard size={12} /> Tarjeta
              </p>
              <div className="space-y-2">
                <input value={datos.tarjeta} onChange={set("tarjeta")} inputMode="numeric" placeholder="1234 1234 1234 1234"
                  className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm tabular-nums text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={datos.vence} onChange={set("vence")} placeholder="MM / AA"
                    className="border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm tabular-nums text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                  <input value={datos.cvc} onChange={set("cvc")} placeholder="CVC"
                    className="border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm tabular-nums text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                </div>
              </div>
            </div>
          </div>
        )}

        {!pagado && !cancelado && pasarela === 'mock' && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 space-y-3">
            {(
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Entorno de prueba: no se cobra nada de verdad. Los botones simulan lo que hará
                la pasarela.
              </p>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onClick={() => accion("pagar")}
              disabled={pagando}
              className="w-full bg-[#1b3f7a] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#162d60] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pagando ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {pagando ? "Procesando…" : `Pagar ${fmtMXN(venta.total)}`}
            </button>

            <button
              onClick={() => accion("cancelar")}
              disabled={pagando}
              className="w-full border border-[#D0E4EC] text-[#5B7A8C] py-2.5 rounded-xl font-semibold text-xs hover:border-red-200 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              Simular pago rechazado
            </button>

            <p className="text-[10px] text-[#B0C8D4] text-center leading-relaxed">
              Con Stripe acá van a aparecer tarjeta y transferencia SPEI.
            </p>
          </div>
        )}

        {/* Detalle del cobro, solo en prueba: sirve para ver el costo real */}
        {pagado && pasarela === 'mock' && venta.payment_fee != null && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-4 text-xs text-[#5B7A8C] space-y-1">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-1">
              Simulación del cobro
            </p>
            <div className="flex justify-between"><span>Cobrado</span><span className="tabular-nums">{fmtMXN(venta.total)}</span></div>
            <div className="flex justify-between"><span>Comisión de pasarela (estimada)</span><span className="tabular-nums text-red-500">−{fmtMXN(venta.payment_fee)}</span></div>
            <div className="flex justify-between font-bold text-[#1b3f7a] pt-1 border-t border-[#EEF3F7]">
              <span>Entra a Vitahub</span><span className="tabular-nums">{fmtMXN(venta.payment_neto)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
