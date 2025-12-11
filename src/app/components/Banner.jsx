"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function Header() {
  const [banner, setBanner] = useState({
    url: "/BANNER.webp",
    description: "Default"
  });

  useEffect(() => {
    fetch("/api/data/banner")
      .then(r => r.json())
      .then(setBanner)
      .catch(() => {});
  }, []);

  return (
    <Image
      src={banner.url}
      alt={banner.description}
      width={1200}
      height={130}
      style={{ width: "100%", height: "auto" }}
      priority
    />
  );
}
