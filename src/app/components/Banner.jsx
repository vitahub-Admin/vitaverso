"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function Header() {
  const [bannerUrl, setBannerUrl] = useState("/BANNER.webp");

  useEffect(() => {
    fetch("/api/sheet/banner")
      .then(async (res) => {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (data?.bannerUrl) setBannerUrl(data.bannerUrl);
        } catch (err) {
          console.error("Respuesta no válida del servidor:", text);
        }
      })
      .catch((err) => {
        console.error("Error obteniendo banner:", err);
      });
  }, []);

  return (
    <Image
      src={bannerUrl}
      alt="Banner afiliados"
      width={1200}
      height={130}
      style={{ width: "100%", height: "auto" }}
      priority
    />
  );
}
