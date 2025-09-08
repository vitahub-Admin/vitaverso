"use client";
import { Suspense } from "react";
import HomePageClient from "../HomePageClient";
import BackButton from "./BackButton";
import Image from "next/image";

export default function Header() {
  return (
    <header className="w-full bg-[#fafafa] text-[#1b3f7a] flex items-center justify-between px-4 shadow-md">
      <div className="flex gap-4 items-center">
        <BackButton />
        <Image src="/LOGO.png" alt="VITAHUB" width={273} height={80} />
    
      </div>
      <Suspense fallback={<p>Cargando cliente...</p>}>
        <HomePageClient />
      </Suspense>
    </header>
  );
}
