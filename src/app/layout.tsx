import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

const DESCRIPTION =
  "A party card game for people with questionable standards. Fill in the blanks. Make your friends regret inviting you.";

export const metadata: Metadata = {
  // Shared links need full URLs for the preview image. SITE_URL can point to another domain later.
  metadataBase: new URL(process.env.SITE_URL ?? "https://cards-against-decency.onrender.com"),
  title: "Cards Against Decency",
  description: DESCRIPTION,
  openGraph: { title: "Cards Against Decency", description: DESCRIPTION, siteName: "Cards Against Decency", type: "website" },
  twitter: { card: "summary_large_image" },
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
              Cards Against Decency is a free, non-commercial fan project. It is not affiliated with or endorsed by Cards
              Against Humanity LLC. Card text from Cards Against Humanity, used under{" "}
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
