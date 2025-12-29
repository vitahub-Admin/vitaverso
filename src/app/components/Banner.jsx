"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function Header() {
  const [banner, setBanner] = useState({
    url: "/BANNER.webp",
    description: "Default"
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/data/banner")
      .then(r => r.json())
      .then(data => {
        setBanner(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="w-full h-[130px] bg-gray-200 animate-pulse rounded"></div>
    );
  }

  return (
    <Image
      src={banner.url}
      alt={banner.description}
      width={1200}
      height={130}
      style={{ width: "100%", height: "auto" }}
      priority
      unoptimized={banner.url.startsWith("http")} // Para imágenes externas
    />
  );
}