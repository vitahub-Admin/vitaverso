"use client";

/**
 * Vuelta a la tienda pública.
 *
 * Ocupaba dos renglones de texto en el encabezado para algo que casi nadie
 * usa: queda solo la flecha, y el texto aparece al pasar el mouse. En táctil,
 * donde no hay hover, el `title` lo muestra igual al mantener presionado.
 */

import { FaArrowLeft } from "react-icons/fa";

export default function BackButton() {
  const handleClick = () => {
    window.location.href = "https://www.vitahub.mx"; // navegación externa
  };

  return (
    <button
      onClick={handleClick}
      title="Volver a Vitahub.mx"
      aria-label="Volver a Vitahub.mx"
      className="group flex items-center gap-1.5 p-1 m-1 rounded-full hover:bg-gray-400/20 transition-colors"
    >
      <span className="flex items-center justify-center w-9 h-9 border border-gray-300 rounded-full shrink-0">
        <FaArrowLeft />
      </span>
      {/* El texto crece desde cero al pasar el mouse, así no reserva lugar */}
      <span
        className="hidden md:block overflow-hidden whitespace-nowrap text-xs text-gray-500
          max-w-0 opacity-0 transition-all duration-200
          group-hover:max-w-[140px] group-hover:opacity-100 group-hover:pr-1"
      >
        Volver a Vitahub.mx
      </span>
    </button>
  );
}
