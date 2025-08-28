import { Suspense } from "react";
import HomeCharts from "./HomeCharts";
import HomePageClient from "./HomePageClient";
import LookerEmbed from "./LookerEmbed";

export default function Page() {
  return (
    <div className="">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
   
        <LookerEmbed/>
      </main>

      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
        FOOTER
      </footer>
    </div>
  );
}
