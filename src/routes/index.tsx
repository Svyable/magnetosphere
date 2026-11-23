import { createFileRoute } from "@tanstack/react-router";
import MissionApp from "@/components/mag/MissionApp";
import BroadcastApp from "@/components/mag/BroadcastApp";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "MAGNETOSPHERE / EARTH NOW — live space weather in 3D" },
      { name: "description", content: "Live 3D magnetosphere driven by NOAA L1 solar wind, Kp, and OVATION aurora, with honest model caveats." },
      { property: "og:title", content: "MAGNETOSPHERE / EARTH NOW" },
      { property: "og:description", content: "Live 3D magnetosphere driven by NOAA L1 solar wind, Kp, and OVATION aurora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IndexView,
});
/** Same documented root route works on GitHub Pages without SPA deep-link rewrites. */
function IndexView(){
 const broadcast=typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("broadcast")==="1";
 return broadcast?<BroadcastApp/>:<MissionApp/>;
}
