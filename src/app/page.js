"use client";
  
  import { Suspense } from "react";
  import HomeCharts from "./HomeCharts";
  import HomePageClient from "./HomePageClient";
  import LookerEmbed from "./LookerEmbed";
  import Banner from "./components/Banner"
  import { redirect } from "next/navigation";


  export default function Page() {
      redirect("/ganancias"); // Cambiá la ruta destino aquí
  }
