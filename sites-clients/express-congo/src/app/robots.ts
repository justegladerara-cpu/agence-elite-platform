import { production, siteUrl } from "@/config";
import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: production() ? "/" : undefined,
      disallow: production()
        ? ["/admin", "/espace-client", "/suivi", "/api"]
        : ["/"],
    },
    sitemap: production() ? siteUrl() + "/sitemap.xml" : undefined,
  };
}
