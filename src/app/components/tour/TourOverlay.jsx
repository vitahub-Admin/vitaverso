"use client";

/**
 * Capa visual del tour: oscurece la pantalla, recorta el elemento señalado y
 * muestra la tarjeta explicativa al lado.
 *
 * Notas de implementación que importan:
 *  · El recorte se hace con un box-shadow gigante sobre un div del tamaño del
 *    target. Un solo elemento, y anima suave entre pasos.
 *  · Medimos con getBoundingClientRect (coordenadas de viewport) y el overlay
 *    es `fixed`, así que el scroll interno de <main> no lo descoloca.
 *  · El listener de scroll va en fase de captura porque quien scrollea es
 *    <main>, no window: sin `true` no nos enteraríamos.
 *  · Si el target no aparece tras ~2s, avanzamos. Un paso que apunta a un
 *    elemento que ya no existe no debe dejar al usuario encerrado.
 */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const FIND_INTERVAL = 100;
const FIND_TRIES    = 20;   // ~2s
const SPOT_PAD      = 8;
const CARD_W        = 340;
const GAP           = 14;

export default function TourOverlay({ step, index, total, isLast, onNext, onPrev, onSkip }) {
  const [rect, setRect]     = useState(null);
  const [narrow, setNarrow] = useState(false);
  const [cardH, setCardH]   = useState(190); // se corrige al medir
  const cardRef = useRef(null);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  // Medimos la tarjeta para poder acotarla al viewport. Sin esto, un elemento
  // alto empuja la tarjeta fuera de pantalla y el tour queda inutilizable.
  useEffect(() => {
    if (cardRef.current) {
      const h = cardRef.current.offsetHeight;
      if (h && Math.abs(h - cardH) > 4) setCardH(h);
    }
  });

  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Buscar el target (puede tardar en montar si la página está cargando datos)
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    setRect(null);

    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(() => { if (!cancelled) setRect(el.getBoundingClientRect()); }, 380);
        return;
      }
      if (++tries >= FIND_TRIES) {
        console.warn(`[tour] target "${step.target}" no encontrado (paso ${step.id}) — avanzando`);
        onNextRef.current();
        return;
      }
      setTimeout(tick, FIND_INTERVAL);
    };
    tick();
    return () => { cancelled = true; };
  }, [step.id, step.target]);

  // Reposicionar mientras el paso está activo.
  //
  // No alcanza con scroll y resize: contenido que llega por fetch después de
  // medir (una tarjeta que aparece arriba, una imagen que carga) empuja el
  // layout y el recorte queda señalando dónde estaba el elemento, no dónde
  // está. No existe un evento para eso, así que re-medimos periódicamente y
  // solo actualizamos si la posición cambió de verdad.
  useEffect(() => {
    const update = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect(prev =>
        prev
        && Math.abs(prev.top    - r.top)    < 1
        && Math.abs(prev.left   - r.left)   < 1
        && Math.abs(prev.width  - r.width)  < 1
        && Math.abs(prev.height - r.height) < 1
          ? prev : r
      );
    };
    const id = setInterval(update, 200);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step.id, step.target]);

  // Escape cierra el tour
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onSkip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  if (!rect) return null;

  // ── Posición de la tarjeta ────────────────────────────────────────────────
  let cardStyle;
  if (narrow) {
    cardStyle = { left: 12, right: 12, bottom: 16, width: "auto" };
  } else {
    // Siempre coordenadas explícitas y acotadas al viewport. Nada de
    // translate(-100%): con un elemento alto la tarjeta terminaba en
    // coordenadas negativas, fuera de pantalla y sin forma de continuar.
    const clampX = (x) => Math.max(12, Math.min(x, window.innerWidth  - CARD_W - 12));
    const clampY = (y) => Math.max(12, Math.min(y, window.innerHeight - cardH  - 12));
    const centerX = rect.left + rect.width / 2 - CARD_W / 2;

    let place = step.placement || "bottom";
    // Si la posición pedida no entra, probamos la opuesta antes de acotar
    if (place === "bottom" && rect.bottom + GAP + cardH + 12 > window.innerHeight
        && rect.top - GAP - cardH > 12) place = "top";
    else if (place === "top" && rect.top - GAP - cardH < 12
        && rect.bottom + GAP + cardH + 12 < window.innerHeight) place = "bottom";

    if (place === "right") {
      cardStyle = { top: clampY(rect.top), left: clampX(rect.right + GAP), width: CARD_W };
    } else if (place === "left") {
      cardStyle = { top: clampY(rect.top), left: clampX(rect.left - GAP - CARD_W), width: CARD_W };
    } else if (place === "top") {
      cardStyle = { top: clampY(rect.top - GAP - cardH), left: clampX(centerX), width: CARD_W };
    } else {
      cardStyle = { top: clampY(rect.bottom + GAP), left: clampX(centerX), width: CARD_W };
    }
  }

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Recorte: el box-shadow gigante oscurece todo menos este rectángulo */}
      <div
        className="pointer-events-none absolute rounded-xl transition-all duration-300 ease-out"
        style={{
          top:        rect.top - SPOT_PAD,
          left:       rect.left - SPOT_PAD,
          width:      rect.width + SPOT_PAD * 2,
          height:     rect.height + SPOT_PAD * 2,
          boxShadow:  "0 0 0 9999px rgba(13,33,51,0.72)",
          outline:    "2px solid #1E8FA8",
          outlineOffset: "-2px",
        }}
      />

      {/* Tarjeta */}
      <div
        ref={cardRef}
        className="absolute bg-white rounded-2xl border border-[#D0E4EC] shadow-2xl p-5 transition-all duration-300 ease-out"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#1E8FA8]">
            Paso {index + 1} de {total}
          </span>
          <button onClick={onSkip} aria-label="Salir del tour"
            className="text-[#B0C8D4] hover:text-[#5B7A8C] transition-colors -mt-1 -mr-1">
            <X size={16} />
          </button>
        </div>

        <h3 className="text-sm font-bold text-[#1b3f7a] leading-snug mb-1.5">{step.title}</h3>
        <p className="text-xs text-[#5B7A8C] leading-relaxed">{step.body}</p>

        {/* Progreso */}
        <div className="h-1 bg-[#EEF3F7] rounded-full mt-4 mb-3.5">
          <div className="h-full bg-[#1E8FA8] rounded-full transition-all duration-300"
            style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onSkip}
            className="text-[11px] font-semibold text-[#8AAAB8] hover:text-[#5B7A8C] transition-colors">
            Salir
          </button>
          <div className="ml-auto flex items-center gap-2">
            {index > 0 && (
              <button onClick={onPrev}
                className="px-3 py-2 rounded-lg text-xs font-bold text-[#5B7A8C] border border-[#D0E4EC] hover:bg-[#F7F9FB] transition-all">
                Atrás
              </button>
            )}
            <button onClick={onNext}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#1b3f7a] text-white hover:bg-[#162d60] transition-all active:scale-[0.98]">
              {isLast ? "Terminar" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
