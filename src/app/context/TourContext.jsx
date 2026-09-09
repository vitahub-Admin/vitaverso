"use client";

/**
 * Motor del tour de bienvenida.
 *
 * Responsabilidades:
 *  · mantener en qué paso va el usuario y persistirlo
 *  · navegar solo cuando el paso siguiente vive en otra ruta, y retomar ahí
 *  · exponer start / next / prev / skip al resto de la app
 *
 * El progreso se guarda hoy en localStorage. Está aislado en readState/
 * writeState para poder moverlo a Supabase (columna en `affiliates`) sin tocar
 * el resto: solo cambian esas dos funciones.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TOUR_ID, TOUR_STEPS } from "@/lib/tour/steps";
import TourOverlay from "../components/tour/TourOverlay";

const STORAGE_KEY = `vh_tour_${TOUR_ID}`;

const TourContext = createContext(null);
export const useTour = () => useContext(TourContext);

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { status: "idle", index: 0 };
    const s = JSON.parse(raw);
    return { status: s.status || "idle", index: Number(s.index) || 0 };
  } catch {
    return { status: "idle", index: 0 };
  }
}

function writeState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export function TourProvider({ children }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [status, setStatus] = useState("idle"); // idle | running | done | skipped
  const [index,  setIndex]  = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Evita re-navegar en loop mientras Next resuelve la ruta
  const navigatingTo = useRef(null);

  useEffect(() => {
    const s = readState();
    setStatus(s.status);
    setIndex(s.index);
    setHydrated(true);
  }, []);

  const persist = useCallback((next) => {
    setStatus(next.status);
    setIndex(next.index);
    writeState(next);
  }, []);

  const step    = status === "running" ? TOUR_STEPS[index] : null;
  const isLast  = index >= TOUR_STEPS.length - 1;

  // Un paso puede pedir query params (ej. abrir una colección) para que su
  // elemento exista. La comparación de ruta usa solo el pathname.
  const href = (s) => (s.query ? `${s.path}?${s.query}` : s.path);

  const start = useCallback(() => {
    persist({ status: "running", index: 0 });
    const first = TOUR_STEPS[0];
    if (first) {
      navigatingTo.current = first.path;
      router.push(href(first));
    }
  }, [persist, router]);

  const finish = useCallback(() => persist({ status: "done",    index: TOUR_STEPS.length - 1 }), [persist]);
  const skip   = useCallback(() => persist({ status: "skipped", index }), [persist, index]);

  const goTo = useCallback((i) => {
    if (i < 0 || i >= TOUR_STEPS.length) return finish();
    persist({ status: "running", index: i });
  }, [persist, finish]);

  const next = useCallback(() => (isLast ? finish() : goTo(index + 1)), [isLast, finish, goTo, index]);
  const prev = useCallback(() => goTo(Math.max(0, index - 1)), [goTo, index]);

  // Arranque por URL: ?tour=1 lo inicia, ?tour=reset lo deja como nuevo.
  // Sirve para probarlo y para linkearlo desde el mail de bienvenida.
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!hydrated) return;
    const flag = searchParams.get("tour");
    if (flag === "reset") persist({ status: "idle", index: 0 });
    else if (flag === "1" && status !== "running") persist({ status: "running", index: 0 });
  }, [hydrated, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si el paso actual vive en otra ruta, llevamos al usuario ahí.
  useEffect(() => {
    if (!hydrated || status !== "running" || !step) return;
    if (step.path === pathname) { navigatingTo.current = null; return; }
    if (navigatingTo.current === step.path) return;
    navigatingTo.current = step.path;
    router.push(href(step));
  }, [hydrated, status, step, pathname, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    status, index, step, isLast,
    total: TOUR_STEPS.length,
    start, next, prev, skip, finish, goTo,
    isRunning: status === "running",
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      {hydrated && status === "running" && step && step.path === pathname && (
        <TourOverlay step={step} index={index} total={TOUR_STEPS.length}
          isLast={isLast} onNext={next} onPrev={prev} onSkip={skip} />
      )}
    </TourContext.Provider>
  );
}
