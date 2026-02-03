"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function Banner({ youtubeVideoUrl }) {
  const [banner, setBanner] = useState({
    url: "/BANNER.webp",
    description: "Default Banner"
  });

  // Cargar banner en background, sin bloquear nada
  useEffect(() => {
    fetch("/api/data/banner")
      .then(r => r.json())
      .then(data => {
        if (data && data.url) {
          setBanner(data);
        }
      })
      .catch(() => {
        // Silently fail, keep default banner
      });
  }, []);

  const getYouTubeVideoId = (url) => {
    if (!url) return null;
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
  };

  const videoId = getYouTubeVideoId(youtubeVideoUrl);
  const hasVideo = youtubeVideoUrl && videoId;

  return (
    <div className={`flex ${hasVideo ? 'flex-col md:flex-row' : 'w-full'} gap-4 mb-6`}>
      {/* BANNER - Siempre muestra algo (ahora a la izquierda) */}
      <div className={`${hasVideo ? 'md:w-3/4' : 'w-full'}`}>
        <Image
          src={banner.url}
          alt={banner.description}
          width={1200}
          height={130}
          className="w-full h-auto rounded-lg"
          priority
          unoptimized={banner.url.startsWith("http")}
        />
      </div>

      {/* VIDEO - Renderizado inmediato (ahora a la derecha) */}
      {hasVideo && (
        <div className="md:w-1/4 w-full">
          <div className="relative w-full h-0 pb-[56.25%] rounded-lg overflow-hidden">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0`}
              className="absolute top-0 left-0 w-full h-full"
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  );
}