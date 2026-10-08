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
import { Check, X, Loader2, ShieldCheck, CreditCard, Package, Minus, Plus, Trash2, Tag, Zap } from "lucide-react";
import { unidadesEnMano } from "@/lib/envio";
import { ESTADOS_MX } from "@/lib/estadosMx";

// Tope por línea: nadie se lleva 40 frascos del mismo producto desde el
// consultorio, y sin tope un dedo apoyado en el "+" arma un pedido absurdo.
const MAX_POR_LINEA = 12;

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 })
    .format(Number(n) || 0);

export default function CobroPage({ params }) {
  const { id } = use(params);
  const [venta, setVenta]   = useState(null);
  const [pasarela, setPasarela] = useState(null);   // shopify | mock | no-disponible
  const [montoACobrar, setMontoACobrar] = useState(0);
  const [modoPrueba, setModoPrueba]     = useState(false);
  const [error, setError]   = useState(null);
  const [pagando, setPagando] = useState(false);
  const [ajustando, setAjustando] = useState(null);  // variant_id en vuelo
  const [cupon, setCupon]         = useState("");
  const [cuponMsg, setCuponMsg]   = useState(null);  // { tipo, texto }
  const [cuponEnVuelo, setCuponEnVuelo] = useState(false);

  // Opciones de envío que ofrece Shopify para la dirección que puso el paciente
  const [opciones, setOpciones]               = useState([]);
  const [cargandoOpciones, setCargandoOpciones] = useState(false);
  const [errorEnvio, setErrorEnvio]           = useState(null);
  const [eligiendo, setEligiendo]             = useState(false);

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
      setMontoACobrar(d.monto_a_cobrar ?? d.venta?.total ?? 0);
      setModoPrueba(Boolean(d.modo_prueba));
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { cargar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Envío ───────────────────────────────────────────────────────────────────
  // Todo esto va antes de los `return` de la página: los hooks no pueden ir después.
  const hayEnvioV   = Boolean(venta) && (venta.items || []).some(i => i.quantity > unidadesEnMano(i));
  const abierta     = Boolean(venta) && venta.estado === "pendiente";
  const direccion   = { calle: datos.calle, colonia: datos.colonia, cp: datos.cp, ciudad: datos.ciudad, estado: datos.estado };
  const direccionLista = Boolean(datos.calle.trim()) && /^\d{5}$/.test(datos.cp.trim()) && Boolean(datos.ciudad.trim()) && ESTADOS_MX.includes(datos.estado);

  // Lo que viaja, por variante. Si cambia (el paciente sacó o agregó algo) las
  // tarifas pueden ser otras: el servidor ya descartó la elegida y hay que volver a pedirlas.
  const firmaEnvio = venta
    ? (venta.items || []).map(i => `${i.variant_id}:${Math.max(0, i.quantity - unidadesEnMano(i))}`).join(",")
    : "";

  /** El paciente elige una opción. El precio lo vuelve a consultar el servidor. */
  const elegirEnvio = async (handle) => {
    setEligiendo(true);
    setErrorEnvio(null);
    try {
      const r = await fetch(`/api/consignment/sale/${id}/envio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direccion, handle }),
      });
      const d = await r.json();
      if (!d.ok) {
        setErrorEnvio(d.error);
        if (d.opciones) setOpciones(d.opciones);
        return;
      }
      setVenta(v => ({ ...v, ...d.venta }));
      if (d.descuento_caido) setCuponMsg({ tipo: "error", texto: "Tu código dejó de aplicar con este envío" });
    } catch (e) {
      setErrorEnvio(e.message);
    } finally {
      setEligiendo(false);
    }
  };

  // Cuando la dirección está completa, o cambia lo que viaja, se piden las opciones a
  // Shopify. Se espera un momento tras la última tecla para no consultar en cada letra.
  useEffect(() => {
    if (!abierta || !hayEnvioV || !direccionLista) { setOpciones([]); return; }

    let cancelado = false;
    const espera = setTimeout(async () => {
      setCargandoOpciones(true);
      setErrorEnvio(null);
      try {
        const r = await fetch(`/api/consignment/sale/${id}/envio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direccion }),
        });
        const d = await r.json();
        if (cancelado) return;
        if (!d.ok) { setOpciones([]); setErrorEnvio(d.error); return; }
        setOpciones(d.opciones);

        // Si todavía no hay una elegida, o la que había ya no existe para esta
        // dirección, se propone el mismo servicio si sigue disponible, y si no la más
        // barata. Queda a la vista y se puede cambiar.
        const actual = venta?.envio_tarifa;
        if (!d.opciones.some(o => o.handle === actual?.handle)) {
          const mismoServicio = d.opciones.find(o => actual && o.titulo === actual.titulo);
          await elegirEnvio((mismoServicio || d.opciones[0]).handle);
        }
      } catch (e) {
        if (!cancelado) { setOpciones([]); setErrorEnvio("No pudimos consultar las opciones de envío. Intenta de nuevo."); }
      } finally {
        if (!cancelado) setCargandoOpciones(false);
      }
    }, 600);

    return () => { cancelado = true; clearTimeout(espera); };
  }, [abierta, hayEnvioV, direccionLista, datos.calle, datos.cp, datos.ciudad, datos.estado, firmaEnvio]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si el paciente vuelve con "atrás" desde el checkout de Shopify, el navegador
  // restaura esta página tal como se fue —con el botón en "Abriendo el pago…"—.
  // Se destraba y se vuelve a leer el estado: puede que ya haya pagado.
  useEffect(() => {
    const alVolver = (e) => { if (e.persisted) { setPagando(false); cargar(); } };
    window.addEventListener("pageshow", alVolver);
    return () => window.removeEventListener("pageshow", alVolver);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Ajusta la cantidad de una línea. Solo se mueve lo que la especialista
   * prescribió: no hay manera de agregar un producto que no esté en el
   * protocolo, y eso lo vuelve a verificar el servidor.
   *
   * Los totales los rehace el servidor con el precio vivo: acá no se calcula
   * nada, solo se pide el cambio y se muestra lo que vuelve.
   */
  const cambiarCantidad = async (variantId, nueva) => {
    const items = venta?.items || [];
    const cantidades = {};
    for (const it of items) {
      cantidades[String(it.variant_id)] =
        String(it.variant_id) === String(variantId) ? nueva : it.quantity;
    }

    setAjustando(variantId);
    setError(null);
    try {
      const r = await fetch(`/api/consignment/sale/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cantidades }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error); return; }
      // El PATCH devuelve la fila, no el profesional ni su foto: se conservan.
      setVenta(v => ({ ...v, ...d.venta }));
      // Un cupón con mínimo de compra deja de aplicar si el pedido baja: hay
      // que decirlo, si no el total sube solo y parece un error.
      if (d.descuento_caido) {
        setCuponMsg({ tipo: "error", texto: "Tu código dejó de aplicar con este pedido" });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setAjustando(null);
    }
  };

  /** Aplica o quita el código de descuento. El monto lo decide el servidor. */
  const moverCupon = async (accion) => {
    setCuponEnVuelo(true);
    setCuponMsg(null);
    try {
      const r = await fetch(`/api/consignment/sale/${id}/descuento`, {
        method: accion === "quitar" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: accion === "quitar" ? undefined : JSON.stringify({ codigo: cupon }),
      });
      const d = await r.json();
      if (!d.ok) { setCuponMsg({ tipo: "error", texto: d.error }); return; }

      setVenta(v => ({ ...v, ...d.venta }));
      setCupon("");
      setCuponMsg(accion === "quitar"
        ? null
        : { tipo: "ok", texto: d.sobreEnvio ? "Envío gratis aplicado" : "Código aplicado" });
    } catch (e) {
      setCuponMsg({ tipo: "error", texto: e.message });
    } finally {
      setCuponEnVuelo(false);
    }
  };

  /**
   * Arma el cobro en Shopify y manda al paciente a su checkout. Lo que se cobra
   * lo decide el servidor: acá solo se mandan los datos del paciente.
   */
  const pagarEnShopify = async () => {
    setPagando(true);
    setError(null);
    try {
      const r = await fetch(`/api/consignment/sale/${id}/pagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direccion: hayEnvio
            ? { calle: datos.calle, colonia: datos.colonia, cp: datos.cp, ciudad: datos.ciudad, estado: datos.estado }
            : null,
        }),
      });
      const d = await r.json();
      if (!d.ok) {
        setError(d.error);
        setPagando(false);
        // Cambiaron los precios o se agotó algo: el servidor ya dejó el pedido al día,
        // hay que mostrarle al paciente los totales nuevos junto con el aviso.
        if (d.cambio || d.sinStock) await cargar();
        return;
      }

      // Ya estaba pagado (el paciente pagó y volvió antes de que llegara el aviso)
      if (d.pagado) { await cargar(); setPagando(false); return; }

      // Se queda "Abriendo el pago…" mientras el navegador cambia de página
      window.location.href = d.url;
    } catch (e) {
      setError(e.message);
      setPagando(false);
    }
  };

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

  // Hay envío si alguna línea lleva más unidades de las que la especialista
  // tiene en el consultorio. Las unidades extra siempre se envían.
  const hayEnvio  = (venta.items || []).some(i => i.quantity > unidadesEnMano(i));
  const pagado    = venta.estado === "pagado";
  // Una venta reembolsada queda cerrada igual que una cancelada: el enlace no debe
  // volver a ofrecer el formulario de pago. Solo cambia lo que se le dice al paciente.
  const reembolsado = venta.estado === "reembolsado";
  const cancelado   = venta.estado === "cancelado" || reembolsado;
  const editable  = !pagado && !cancelado;
  const activos   = (venta.items || []).filter(i => i.quantity > 0).length;
  const descuento = Number(venta.descuento || 0);

  return (
    <div className="min-h-screen bg-[#F7F9FB] py-8 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Encabezado */}
        <div className="text-center mb-6">
          {/* Texto hasta que haya un logo propio para el paciente: el de PRO
              dice "Profesionales" y esta página no es para ellos. */}
          <p className="text-2xl font-extrabold tracking-tight text-[#1b3f7a]">vitahub</p>
        </div>

        {/* En escritorio, dos columnas: a la izquierda se completa y se paga,
            a la derecha el pedido, con lugar para que las fotos se vean. En
            mobile se apilan, con el pedido primero. */}
        <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">

        <div className="space-y-4 order-2 lg:order-1">

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
            <p className="text-base font-bold text-red-700">{reembolsado ? "Pago reembolsado" : "Pago cancelado"}</p>
            <p className="text-xs text-red-600 mt-1">
              {reembolsado
                ? "Esta compra se canceló y tu pago se devolvió. Si quieres volver a comprar, pídele a tu especialista un enlace nuevo."
                : "Pídele a tu especialista que genere uno nuevo."}
            </p>
          </div>
        )}

        {/* Pago */}
        {!pagado && !cancelado && pasarela === 'no-disponible' && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 text-center">
            <p className="text-sm font-bold text-[#1b3f7a]">El cobro todavía no está habilitado</p>
            <p className="text-xs text-[#5B7A8C] mt-1 leading-relaxed">
              Tu especialista va a contactarte para completar el pago.
            </p>
          </div>
        )}

        {!pagado && !cancelado && (pasarela === 'mock' || pasarela === 'shopify') && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 space-y-4">
            {/* Nombre y correo solo en la simulación: con Shopify los escribe el
                paciente en su checkout y el webhook de pago los guarda. */}
            {pasarela === 'mock' && <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2">Tus datos</p>
              <div className="space-y-2">
                <input value={datos.nombre} onChange={set("nombre")} placeholder="Nombre completo"
                  className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                <input value={datos.email} onChange={set("email")} type="email" placeholder="Correo electrónico"
                  className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]" />
                <p className="text-[10px] text-[#B0C8D4]">Ahí te llega tu compra y las indicaciones de toma.</p>
              </div>
            </div>}

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
                    {/* Lista y no texto libre: de ahí sale la zona de envío. Con "CDMX",
                        "DF" o un error de dedo, el paciente vería tarifas equivocadas. */}
                    <select value={datos.estado} onChange={set("estado")}
                      className={`border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1E8FA8] ${datos.estado ? "text-[#1b3f7a]" : "text-[#B0C8D4]"}`}>
                      <option value="">Estado</option>
                      {ESTADOS_MX.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                </div>

                {/* Cómo recibirlo: las tarifas son las de Shopify, calculadas solo con lo
                    que viaja. Lo que se entrega en el consultorio no cuenta. */}
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mt-4 mb-2">Cómo quieres recibirlo</p>
                {!direccionLista ? (
                  <p className="text-[11px] text-[#8AAAB8]">Completa tu dirección para ver las opciones de envío.</p>
                ) : cargandoOpciones && !opciones.length ? (
                  <p className="text-[11px] text-[#8AAAB8] flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Consultando opciones…</p>
                ) : errorEnvio && !opciones.length ? (
                  <p className="text-[11px] text-red-500 leading-snug">{errorEnvio}</p>
                ) : (
                  <div className="space-y-1.5">
                    {opciones.map(o => {
                      const elegida = venta.envio_tarifa?.handle === o.handle;
                      return (
                        <button
                          key={o.handle}
                          type="button"
                          onClick={() => !elegida && elegirEnvio(o.handle)}
                          disabled={eligiendo}
                          className={`w-full flex items-center gap-3 text-left border rounded-lg px-3 py-2.5 transition-colors disabled:opacity-60 ${elegida ? "border-[#1E8FA8] bg-[#F4FAFB]" : "border-[#D0E4EC] hover:border-[#1E8FA8]"}`}
                        >
                          <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${elegida ? "border-[#1E8FA8]" : "border-[#D0E4EC]"}`}>
                            {elegida && <span className="w-2 h-2 rounded-full bg-[#1E8FA8]" />}
                          </span>
                          <span className="flex-1 min-w-0 text-sm text-[#1b3f7a] flex items-center gap-1.5">
                            {o.expres && <Zap size={13} className="text-amber-500 shrink-0" />}
                            <span className="truncate">{o.titulo}</span>
                          </span>
                          <span className={`text-sm font-bold tabular-nums shrink-0 ${o.precio === 0 ? "text-emerald-600" : "text-[#1b3f7a]"}`}>
                            {o.precio === 0 ? "Gratis" : fmtMXN(o.precio)}
                          </span>
                        </button>
                      );
                    })}
                    {errorEnvio && <p className="text-[11px] text-red-500 leading-snug">{errorEnvio}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Los datos de tarjeta solo existen en el simulador. Con Shopify se
                piden en su checkout: nunca pasan por nuestra página. */}
            {pasarela === 'mock' && (
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
            )}
          </div>
        )}

        {/* Pago por Shopify: el botón lleva al checkout de Shopify, donde el
            paciente elige cómo pagar (tarjeta, Google Pay, PayPal, Mercado Pago…) */}
        {!pagado && !cancelado && pasarela === 'shopify' && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 space-y-3">
            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onClick={pagarEnShopify}
              disabled={pagando || eligiendo || cargandoOpciones || (hayEnvio && !venta.envio_tarifa)}
              className="w-full bg-[#1b3f7a] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#162d60] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pagando ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {pagando ? "Abriendo el pago…" : `Continuar al pago · ${fmtMXN(montoACobrar)}`}
            </button>

            <p className="text-[10px] text-[#B0C8D4] text-center leading-relaxed">
              Ahí escribes tu nombre y correo y pagas en el checkout seguro de Shopify.
              Tus datos de tarjeta no pasan por esta página.
            </p>
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

          </div>
        )}

        {/* Detalle del cobro, solo en prueba: sirve para ver el costo real */}
        </div>

        <div className="order-1 lg:order-2 space-y-4">
          {venta.profesional && (
            <div className="flex items-center gap-3 px-1">
              {/* La foto sale de la colección del profesional. Solo una de cada
                  cuatro la tiene cargada, así que el resto va con iniciales. */}
              {venta.profesional_foto ? (
                <img src={venta.profesional_foto} alt={venta.profesional}
                  className="w-14 h-14 rounded-full object-cover border border-[#D0E4EC] shrink-0" />
              ) : (
                <span className="w-14 h-14 rounded-full bg-[#1b3f7a] text-white flex items-center justify-center text-lg font-bold shrink-0">
                  {venta.profesional.charAt(0).toUpperCase()}
                </span>
              )}
              <p className="text-base italic text-[#5B7A8C] leading-snug">
                Tu protocolo armado por<br />
                <span className="font-semibold text-[#1b3f7a] not-italic">{venta.profesional}</span>
              </p>
            </div>
          )}

        {/* Productos */}
        <div className="bg-white border border-[#D0E4EC] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#EEF3F7] flex items-center justify-between gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
              Tu pedido
            </p>
            {editable && (
              <span className="text-[10px] text-[#B0C8D4]">Puedes ajustar las cantidades</span>
            )}
          </div>
          {error && venta && (
            <p className="mx-5 mt-3 text-[11px] text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="divide-y divide-[#EEF3F7]">
            {(venta.items || []).map((it) => {
              const mano    = unidadesEnMano(it);
              const enviar  = Math.max(0, it.quantity - mano);
              const ocupado = String(ajustando) === String(it.variant_id);
              const fuera   = it.quantity === 0;

              // Una línea en cero sigue siendo parte del protocolo: se muestra
              // apagada para que el paciente pueda volver a sumarla. Si ya pagó
              // o se canceló, no tiene sentido mostrarla.
              if (fuera && !editable) return null;

              return (
              <div key={it.variant_id} className={`px-5 py-3 flex gap-3 ${ocupado ? "opacity-50" : ""}`}>
                {it.image ? (
                  <img src={it.image} alt="" className={`w-14 h-14 rounded-lg object-contain bg-[#F7F9FB] border border-[#D0E4EC] shrink-0 ${fuera ? "grayscale opacity-50" : ""}`} />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-[#F7F9FB] border border-[#D0E4EC] shrink-0 flex items-center justify-center text-[#B0C8D4]">
                    <Package size={18} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-snug ${fuera ? "text-[#8AAAB8]" : "text-[#1b3f7a]"}`}>
                    {it.title}
                  </p>
                  <p className="text-[11px] text-[#8AAAB8] mt-0.5">
                    {it.variant_title ? `${it.variant_title} · ` : ""}{fmtMXN(it.price)} c/u
                  </p>

                  {/* De dónde sale cada unidad: lo que la especialista ya tiene
                      se entrega ahí mismo, el resto se envía. */}
                  {mano > 0 && enviar > 0 && (
                    <p className="text-[10px] text-[#8AAAB8] mt-0.5">
                      {mano} en el consultorio · {enviar} por envío
                    </p>
                  )}

                  {!editable ? (
                    <p className="text-[11px] text-[#8AAAB8] mt-0.5 tabular-nums">{it.quantity} unidades</p>
                  ) : fuera ? (
                    <button
                      onClick={() => cambiarCantidad(it.variant_id, 1)}
                      disabled={!!ajustando}
                      className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-[#1E8FA8] hover:text-[#1b3f7a] disabled:opacity-40"
                    >
                      <Plus size={12} /> Volver a agregar
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className="flex items-center border border-[#D0E4EC] rounded-lg overflow-hidden">
                        <button
                          onClick={() => cambiarCantidad(it.variant_id, it.quantity - 1)}
                          disabled={!!ajustando || it.quantity <= 1}
                          className="px-2 py-1 text-[#5B7A8C] hover:bg-[#F7F9FB] disabled:opacity-30 disabled:hover:bg-transparent"
                          aria-label="Quitar una unidad"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="px-2.5 text-sm font-bold text-[#1b3f7a] tabular-nums min-w-[1.5rem] text-center">
                          {it.quantity}
                        </span>
                        <button
                          onClick={() => cambiarCantidad(it.variant_id, it.quantity + 1)}
                          disabled={!!ajustando || it.quantity >= MAX_POR_LINEA}
                          className="px-2 py-1 text-[#5B7A8C] hover:bg-[#F7F9FB] disabled:opacity-30 disabled:hover:bg-transparent"
                          aria-label="Agregar una unidad"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      {/* El pedido no puede quedar vacío */}
                      {activos > 1 && (
                        <button
                          onClick={() => cambiarCantidad(it.variant_id, 0)}
                          disabled={!!ajustando}
                          className="p-1.5 text-[#B0C8D4] hover:text-red-500 disabled:opacity-30"
                          aria-label="Quitar del pedido"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {!fuera && (
                  <p className="text-sm font-bold text-[#1b3f7a] tabular-nums shrink-0">
                    {fmtMXN(it.price * it.quantity)}
                  </p>
                )}
              </div>
              );
            })}
          </div>
          {/* Código de descuento */}
          {editable && (
            <div className="px-5 py-3 border-t border-[#EEF3F7]">
              {venta.descuento_codigo ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                    <Tag size={12} /> {venta.descuento_codigo}
                  </span>
                  <button
                    onClick={() => moverCupon("quitar")}
                    disabled={cuponEnVuelo}
                    className="text-[11px] text-[#B0C8D4] hover:text-red-500 disabled:opacity-40"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={cupon}
                    onChange={(e) => setCupon(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && cupon && moverCupon("aplicar")}
                    placeholder="Código de descuento"
                    className="flex-1 min-w-0 border border-[#D0E4EC] rounded-lg px-3 py-2 text-[13px] uppercase tracking-wider text-[#1b3f7a] placeholder:text-[#B0C8D4] placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:border-[#1E8FA8]"
                  />
                  <button
                    onClick={() => moverCupon("aplicar")}
                    disabled={!cupon || cuponEnVuelo}
                    className="px-3 py-2 rounded-lg border border-[#D0E4EC] text-[12px] font-semibold text-[#5B7A8C] hover:border-[#1E8FA8] hover:text-[#1E8FA8] disabled:opacity-40 shrink-0"
                  >
                    {cuponEnVuelo ? <Loader2 size={13} className="animate-spin" /> : "Aplicar"}
                  </button>
                </div>
              )}
              {cuponMsg && (
                <p className={`text-[11px] mt-1.5 ${cuponMsg.tipo === "ok" ? "text-emerald-600" : "text-red-500"}`}>
                  {cuponMsg.texto}
                </p>
              )}
            </div>
          )}

          <div className="px-5 py-4 bg-[#F7F9FB] space-y-1.5">
            {(hayEnvio || descuento > 0) && (
              <div className="flex items-center justify-between text-xs text-[#5B7A8C]">
                <span>Productos</span>
                <span className="tabular-nums">{fmtMXN(venta.subtotal)}</span>
              </div>
            )}
            {hayEnvio && (
              <div className="flex items-center justify-between text-xs text-[#5B7A8C]">
                <span>Envío{venta.envio_tarifa ? ` · ${venta.envio_tarifa.titulo}` : ""}</span>
                {venta.envio_tarifa ? (
                  <span className={`tabular-nums ${Number(venta.envio) === 0 ? "text-emerald-600 font-semibold" : ""}`}>
                    {Number(venta.envio) === 0 ? "Gratis" : fmtMXN(venta.envio)}
                  </span>
                ) : (
                  // Hasta que elija, el envío no se conoce: no es "gratis", y el total no lo incluye todavía
                  <span className="italic text-[#8AAAB8]">Se calcula con tu dirección</span>
                )}
              </div>
            )}
            {descuento > 0 && (
              <div className="flex items-center justify-between text-xs text-emerald-600 font-semibold">
                <span>Descuento {venta.descuento_codigo ? `· ${venta.descuento_codigo}` : ""}</span>
                <span className="tabular-nums">−{fmtMXN(descuento)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-bold text-[#5B7A8C]">Total</span>
              <span className="text-xl font-extrabold text-[#1b3f7a] tabular-nums">{fmtMXN(venta.total)}</span>
            </div>
          </div>
        </div>

        </div>
        </div>

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
