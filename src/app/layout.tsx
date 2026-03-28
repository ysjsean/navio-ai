import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Navio-AI",
  description:
    "An itinerary-aware accommodation decision agent that selects the best area first, then searches real accommodation websites in that area.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${fraunces.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-background font-sans"
        suppressHydrationWarning
      >
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-40 border-b border-border/40 bg-background/90 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link href="/" className="font-serif text-xl font-semibold">
                Navio-AI
              </Link>
              <nav className="flex items-center gap-4 text-sm">
                <Link href="/search" className="hover:underline">
                  Search
                </Link>
                <Link href="/run" className="hover:underline">
                  Run
                </Link>
                <Link href="/results" className="hover:underline">
                  Results
                </Link>
              </nav>
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="border-t py-6">
            <div className="mx-auto max-w-6xl px-6 text-xs text-muted-foreground">
              Navio-AI · Itinerary-aware accommodation decision agent · Not a travel planner
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
