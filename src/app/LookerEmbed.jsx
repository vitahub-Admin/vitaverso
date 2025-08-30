import { Suspense } from "react";
import HomeCharts from "./HomeCharts";
import HomePageClient from "./HomePageClient";

export default function LookerEmbed({ src }) {
  return (
    <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
    <iframe
      src={src}
      frameBorder="0"
      className="absolute top-0 left-0 w-full h-full "
      style={{"marginLeft": "-58px"}}
      sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    />
  </div>
  );
}
