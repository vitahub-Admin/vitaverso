  import { Suspense } from "react";
  import HomeCharts from "./HomeCharts";
  import HomePageClient from "./HomePageClient";
  import LookerEmbed from "./LookerEmbed";
  import Banner from "./components/Banner"


  export default function Page() {

    const src="https://lookerstudio.google.com/embed/reporting/0076c8f5-2d48-4e45-b9a2-a84c889a706d/page/D2cuE"
    return (
      <div className="">
        <Banner/>
        <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
    
          <LookerEmbed src={src}/>
        </main>

        <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
          FOOTER
        </footer>
      </div>
    );
  }
