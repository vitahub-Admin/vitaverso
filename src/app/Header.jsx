"use client"
// components/Header.jsx
import { Suspense } from "react";
import HomePageClient from "./HomePageClient";
import { FaArrowLeft } from "react-icons/fa";
import BackButton from "./BackButton";
import Image from "next/image";

export default function Header() {
  return (
    <header className="w-full  bg-[#1b3f7a] text-white flex items-center justify-between px-4 shadow-md">
      <div className="flex gap-4 items-center">
   <BackButton/>
   <Image 
        src="/LOGO.png" 
        alt="VITAHUB " 
        width={120} 
        height={40} 
      />
        <h1 className="text-2xl font-bold italic">PRO</h1>
       
      </div>
      <Suspense fallback={<p>Cargando cliente...</p>}>
        <HomePageClient />
      </Suspense>
    </header>
  );
}
