// components/Header.jsx

import Image from "next/image";

export default function Header() {
  return (
    
   
    <Image
    src="/BANNER.webp"
    alt="Banner"
    width={1200} // ancho original de la imagen
    height={130} // alto original de la imagen
    style={{ width: "100%", height: "auto" }} // hace que ocupe todo el contenedor manteniendo proporción
  />

  );
}