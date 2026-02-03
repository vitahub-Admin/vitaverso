"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function Banner({ youtubeVideoUrl }) {
  const [banner, setBanner] = useState({
    url: "/BANNER.webp",
    description: "Default Banner",
  });

  // Carga banner en background
  useEffect(() => {
    fetch("/api/data/banner")
      .then((r) => r.json())
      .then((data) => {
        if (data?.url) {
          setBanner(data);
        }
      })
      .catch(() => {});
  }, []);

  const getYouTubeVideoId = (url) => {
    if (!url) return null;
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
  };

  const videoId = getYouTubeVideoId(youtubeVideoUrl);
  const hasVideo = Boolean(videoId);

  return (
    <div className="flex flex-col md:flex-row gap-4 mb-6">
      {/* BANNER */}
      <div className="w-full md:w-3/4">
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

      {/* VIDEO / FALLBACK (mismo wrapper 16:9) */}
      <div className="hidden md:block md:w-1/4">
        <div className="relative w-full h-0 pb-[56.25%] rounded-lg overflow-hidden bg-black">
          {hasVideo ? (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?loop=1&playlist=${videoId}&controls=1&modestbranding=1&rel=0`}
              className="absolute top-0 left-0 w-full h-full"
              title="YouTube video player"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <Image
              src="/video-fallback.webp"
              alt="Video fallback"
              fill
              className="object-cover"
              priority
            />
          )}
        </div>
      </div>
    </div>
  );
}
