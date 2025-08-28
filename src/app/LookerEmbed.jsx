import { Suspense } from "react";
import HomeCharts from "./HomeCharts";
import HomePageClient from "./HomePageClient";

export default function LookerEmbed() {
  return (
    <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
    <iframe
      src="https://lookerstudio.google.com/embed/reporting/0076c8f5-2d48-4e45-b9a2-a84c889a706d/page/D2cuE"
      frameBorder="0"
      className="absolute top-0 left-0 w-full h-full"

      sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    />
  </div>
  );
}
