"use client";

import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Estado de "Ventas locales" para el menú lateral: ¿esta persona tiene el cobro en efectivo
 * habilitado (producto en consignación) y cuántas ventas tiene por pagar?
 *
 * Se vuelve a leer al cambiar de página, cada 5 minutos y cuando otra pantalla avisa con el
 * evento "ventas-locales:cambio" (al cobrar en efectivo o al pagar).
 */
export function useVentasLocales(pathname) {
  const [estado, setEstado] = useState({ habilitado: false, ventas: 0, a_pagar: 0 });
  const habilitadoRef = useRef(null);   // null = todavía no se sabe

  const leer = useCallback(async () => {
    try {
      // Se averigua una sola vez si tiene el cobro en efectivo; después solo se pregunta cuánto debe
      if (habilitadoRef.current === null) {
        const c = await (await fetch("/api/consignment")).json();
        habilitadoRef.current = Boolean(c.ok && c.efectivo);
      }
      if (!habilitadoRef.current) return;
      const e = await (await fetch("/api/consignment/efectivo?resumen=1")).json();
      setEstado({
        habilitado: true,
        ventas: e.ok ? e.totales.ventas : 0,
        a_pagar: e.ok ? e.totales.a_pagar : 0,
      });
    } catch {}
  }, []);

  useEffect(() => { leer(); }, [leer, pathname]);

  useEffect(() => {
    window.addEventListener("ventas-locales:cambio", leer);
    const t = setInterval(leer, 5 * 60 * 1000);
    return () => { window.removeEventListener("ventas-locales:cambio", leer); clearInterval(t); };
  }, [leer]);

  return estado;
}
