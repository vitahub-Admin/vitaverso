"use client";

/**
 * Ventas locales: lo que el profesional vende en su consultorio.
 *
 * Aquí se juntan las ventas cobradas en efectivo que todavía no se pagan (el carrito por
 * pagar, con el botón para pagarlas) y, al lado, el inventario que tiene en el consultorio.
 * Mientras una venta no se pague, sus productos quedan "por pagar" y no cuentan como disponibles.
 *
 * Por ahora solo se muestra en modo tester (ver src/lib/consignacionTester.js).
 */

import { useEffect, useState } from "react";
import { Banknote, Package } from "lucide-react";
import { useEfectivo, PanelEfectivo } from "../armador-carritos/EfectivoPorLiquidar";

export default function VentasLocalesPage() {
  const [inventario, setInventario] = useState(null);   // null = cargando
  const [habilitado, setHabilitado] = useState(false);
  const [infinito, setInfinito]     = useState(false);
  const efectivo = useEfectivo(habilitado);

  const cargarInventario = async () => {
    try {
      const d = await (await fetch("/api/consignment")).json();
      if (!d.ok) { setInventario([]); return; }
      setHabilitado(Boolean(d.efectivo));
      setInfinito(Boolean(d.infinito));
      setInventario((d.items || []).filter((i) => i.disponible > 0 || (i.reservado || 0) > 0)
        .sort((a, b) => (a.title || "").localeCompare(b.title || "")));
    } catch { setInventario([]); }
  };

  useEffect(() => { cargarInventario(); }, []);
  // Cuando se registra o se paga una venta, el inventario cambia (lo reservado): se vuelve a leer
  useEffect(() => {
    const alCambiar = () => cargarInventario();
    window.addEventListener("ventas-locales:cambio", alCambiar);
    return () => window.removeEventListener("ventas-locales:cambio", alCambiar);
  }, []);

  const porPagarUnidades = (inventario || []).reduce((a, i) => a + (i.reservado || 0), 0);
  const disponibles = (inventario || []).reduce((a, i) => a + i.disponible, 0);

  return (
    <div className="h-full overflow-y-auto bg-[#F7F9FB]">
      <div className="bg-white border-b border-[#EEF3F7] px-5 sm:px-6">
        <div className="max-w-[1100px] mx-auto py-5">
          <h1 className="text-xl font-extrabold text-[#1b3f7a] tracking-tight leading-none flex items-center gap-2">
            <Banknote size={20} className="text-[#1F8383]" /> Ventas locales
          </h1>
          <p className="text-xs text-[#5B7A8C] mt-1.5">
            Lo que vendes en tu consultorio: las ventas en efectivo por pagar y tu inventario.
          </p>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-5 sm:px-6 py-6">
        {inventario === null ? (
          <p className="text-sm text-[#8AAAB8]">Cargando…</p>
        ) : !habilitado ? (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-8 text-center">
            <p className="text-sm font-semibold text-[#1b3f7a]">Esta sección es para profesionales con producto en su consultorio</p>
            <p className="text-xs text-[#8AAAB8] mt-1 max-w-sm mx-auto leading-snug">
              Cuando tengas producto de Vitahub en consignación, aquí vas a ver tus ventas en efectivo y tu inventario.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 items-start">

            {/* Ventas por pagar */}
            <PanelEfectivo efectivo={efectivo} />

            {/* Inventario del consultorio */}
            <div className="bg-white border border-[#D0E4EC] rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#EEF3F7] flex items-center gap-2">
                <Package size={15} className="text-[#1F8383]" />
                <h2 className="text-sm font-bold text-[#1b3f7a]">Tu inventario en el consultorio</h2>
                <span className="ml-auto text-xs text-[#8AAAB8] tabular-nums">{infinito ? "∞" : `${disponibles} disponibles`}</span>
              </div>

              {infinito ? (
                <p className="px-5 py-8 text-center text-xs text-[#8AAAB8] leading-snug">
                  Cuenta de pruebas: tu inventario es virtual (<span className="font-bold text-[#1b3f7a]">∞</span> de todo el catálogo).
                  Nada de esto mueve inventario real.
                </p>
              ) : inventario.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs text-[#8AAAB8]">No tienes producto en tu consultorio.</p>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_72px_72px] gap-2 px-5 py-2 bg-[#F7F9FB] text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
                    <span>Producto</span>
                    <span className="text-right">Disponible</span>
                    <span className="text-right">Por pagar</span>
                  </div>
                  <div className="divide-y divide-[#EEF3F7]">
                    {inventario.map((i) => (
                      <div key={i.variant_id} className="grid grid-cols-[1fr_72px_72px] gap-2 px-5 py-3 items-center">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1b3f7a] leading-snug line-clamp-2">{i.title}</p>
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#1F8383] mt-0.5">
                            {i.variant_title || "Único"}
                            {i.sku && <span className="ml-1.5 font-mono normal-case tracking-normal font-normal text-[#8AAAB8]">{i.sku}</span>}
                          </p>
                        </div>
                        <span className={`text-right text-sm font-bold tabular-nums ${i.disponible > 0 ? "text-[#1b3f7a]" : "text-[#B0C8D4]"}`}>
                          {i.disponible}
                        </span>
                        <span className={`text-right text-sm tabular-nums ${i.reservado > 0 ? "font-bold text-[#B45309]" : "text-[#B0C8D4]"}`}>
                          {i.reservado || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                  {porPagarUnidades > 0 && (
                    <p className="px-5 py-3 text-[11px] text-[#8AAAB8] leading-snug border-t border-[#EEF3F7] bg-[#FFFBEB]">
                      {porPagarUnidades} {porPagarUnidades === 1 ? "unidad" : "unidades"} ya {porPagarUnidades === 1 ? "se entregó" : "se entregaron"} y
                      {" "}{porPagarUnidades === 1 ? "queda" : "quedan"} por pagar. No cuentan como disponibles hasta que las pagues.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
