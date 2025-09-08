"use client";

import { FaArrowLeft } from "react-icons/fa";

export default function BackButton() {
  const handleClick = () => {
    window.location.href = "https://www.vitahub.mx"; // navegación externa
  };

  return (
    <button
      className="flex items-center gap-2 px-3 py-2 m-1  leading-[1] rounded hover:bg-gray-400/20 transition-colors"
      onClick={handleClick}
    >
       <span className="flex items-center justify-center w-9 h-9 border border-gray-300 rounded-full">
        <FaArrowLeft className="" />
      </span>
      <span className="leading-tight">
        Volver <br /> a Vitahub.mx
      </span>
    </button>
  );
}
