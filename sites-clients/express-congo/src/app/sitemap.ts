import { siteUrl, production } from "@/config";
import { publicPaths } from "@/content";
export default function sitemap() {
  return production()
    ? publicPaths
        .filter((p) => p !== "/suivi")
        .map((p) => ({ url: siteUrl() + (p === "/" ? p : p + "/") }))
    : [];
}
