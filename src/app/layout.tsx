import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cards Against Decency",
  description: "A party card game for people with questionable standards. Fill in the blanks. Make your friends regret inviting you.",
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
              {/* Optional tip jar. Kept quiet on purpose: the game is free and stays free. */}
              <a
                className="ml-auto opacity-70 hover:underline hover:opacity-100"
                href="https://buymeacoffee.com/nickelfront"
                target="_blank"
                rel="noopener noreferrer"
              >
                ☕ Buy me a coffee
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
