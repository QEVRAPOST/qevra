import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { LaunchTransitionProvider } from "@/components/landing/LaunchTransition";
import { PROJECT_NAME } from "@/lib/project-brand";
import { createSiteMetadata } from "@/lib/site-metadata";
import "./globals.css";

/*
 * Fonts are self-hosted (src/app/fonts, SIL OFL 1.1 licences alongside) so the build needs no network.
 * next/font renames each family, so the canvas reads the resolved stack from the --f-mono CSS variable.
 */
const instrumentSerif = localFont({
  src: "./fonts/InstrumentSerif-Regular.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-instrument-serif",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const geist = localFont({
  src: "./fonts/Geist-Variable.woff2",
  weight: "100 900",
  variable: "--font-geist",
  display: "swap",
  adjustFontFallback: "Arial",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = createSiteMetadata(PROJECT_NAME);

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#0C0D0F",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${instrumentSerif.variable} ${geist.variable} ${geistMono.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to the content
        </a>
        <LaunchTransitionProvider>{children}</LaunchTransitionProvider>
      </body>
    </html>
  );
}
