import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Pages for search engines. Rooms (/r/CODE) are temporary, so they are not listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/faq", "/terms", "/privacy"].map((path) => ({ url: `${SITE_URL}${path}` }));
}
