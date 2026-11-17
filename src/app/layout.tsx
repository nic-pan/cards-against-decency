import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blank Slate",
  description: "A fill-in-the-blank party card game for friends. Free, no account needed.",
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
              Blank Slate is a free, non-commercial fan project. It is not affiliated with or endorsed by Cards
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
            <p>
              <Link className="underline" href="/privacy">
                Privacy
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
