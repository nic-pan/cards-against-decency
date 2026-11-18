import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Search engines can read the public pages, but not the temporary room pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/r/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
