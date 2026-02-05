"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Play } from "lucide-react";

export default function Banner({ youtubeVideoUrl }) {
  const [banner, setBanner] = useState({
    url: "/BANNER.jpg",
    description: "Default Banner",
  });

  useEffect(() => {
    fetch("/api/data/banner")
      .then((r) => r.json())
      .then((data) => {
        if (data?.url) setBanner(data);
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
      <div className="w-full md:w-4/5">
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

      {/* VIDEO THUMBNAIL */}
      <div className="hidden md:block md:w-1/5">
        {hasVideo && (
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block w-full h-0 pb-[56.25%] rounded-lg overflow-hidden bg-black"
          >
            {/* Thumbnail */}
            <Image
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
              alt="Video thumbnail"
              fill
              className="object-cover"
              priority
            />

            {/* Overlay suave */}
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out" />

            {/* Play button */}
            <div
              className="
                absolute
                bottom-4 left-4
                flex items-center justify-center
                w-10 h-10 rounded-full
                bg-white/90
                transition-all duration-500 ease-out
                group-hover:translate-x-2
                group-hover:-translate-y-2
                group-hover:w-12
                group-hover:h-12
              "
            >
              <Play className="w-6 h-6 text-[#2a5298] ml-0.5" />
            </div>
          </a>
        )}
      </div>
    </div>
  );
}
