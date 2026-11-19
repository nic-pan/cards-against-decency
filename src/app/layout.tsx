import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const TITLE = "Cards Against Decency – A Free Online Party Card Game";
const DESCRIPTION =
  "Play Cards Against Decency online with friends. A free fill-in-the-blank party card game you can play together in your browser. No accounts or downloads required.";

export const metadata: Metadata = {
  // Shared links need full URLs for the preview image.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Cards Against Decency", type: "website" },
  twitter: { card: "summary_large_image" },
  // Google Search Console checks this tag to confirm that we own the site.
  verification: { google: "zcCweSmiYsnvY4uIUHrJPZAUfUBbHRApodEt2jiCWu8" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2efe7" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col antialiased">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line px-4 py-4 text-xs leading-relaxed text-muted">
          <div className="mx-auto max-w-6xl space-y-1">
            <p>
              Cards Against Decency is a free, non-commercial fan project. It is not affiliated with, endorsed by or
              sponsored by Cards Against Humanity LLC. &quot;Cards Against Humanity&quot; is a trademark of Cards Against
              Humanity LLC. Card text from Cards Against Humanity, used under{" "}
              <a className="underline" href="https://creativecommons.org/licenses/by-nc-sa/2.0/" rel="noreferrer">
                CC BY-NC-SA 2.0
              </a>
              , via{" "}
              <a className="underline" href="https://github.com/crhallberg/json-against-humanity" rel="noreferrer">
                JSON Against Humanity
              </a>
              . Adult humour, 18+.
            </p>
            <p className="flex gap-4">
              <Link className="underline" href="/faq">
                FAQ
              </Link>
              <Link className="underline" href="/terms">
                Terms of Use
              </Link>
              <Link className="underline" href="/privacy">
                Privacy Notice
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
