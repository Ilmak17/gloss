import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Atkinson_Hyperlegible_Next, Newsreader, Schibsted_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import { BOOT_SCRIPT } from "@/lib/settings";
import "./globals.css";
import { Tooltips } from "@/components/ui/Tooltips";
import { ClerkProvider } from "@clerk/nextjs";
import { SyncAgent } from "@/components/account/SyncAgent";
import { OG_IMAGE, SITE_URL } from "@/lib/brand";
import { AUTH_ENABLED } from "@/lib/auth-config";

const serif = Newsreader({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--nf-serif",
  display: "swap",
});

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--nf-sans",
  display: "swap",
});

// Bundled variable fonts: optical size, true italics and Cyrillic work offline.
const book = localFont({
  src: [
    { path: "./fonts/literata/Literata-Roman.woff2", weight: "200 900", style: "normal" },
    { path: "./fonts/literata/Literata-Italic.woff2", weight: "200 900", style: "italic" },
  ],
  variable: "--nf-book",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const legible = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--nf-legible",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

const DESCRIPTION = "Your personal library. Read, listen, and discuss the ideas that matter.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Gloss", template: "%s" },
  description: DESCRIPTION,
  applicationName: "Gloss",
  openGraph: { type: "website", siteName: "Gloss", title: "Gloss", description: DESCRIPTION, url: "/", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: "Gloss", description: DESCRIPTION, images: [OG_IMAGE.url] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#151412" },
  ],
};

/** Clerk's sign-in and account screens, in the page's own ink and paper, in every theme. */
const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "var(--ink)",
    colorBackground: "var(--bg-raised)",
    colorForeground: "var(--ink)",
    colorMutedForeground: "var(--ink-3)",
    colorInput: "var(--bg)",
    colorInputForeground: "var(--ink)",
    colorBorder: "var(--rule-strong)",
    colorNeutral: "var(--ink)",
    fontFamily: "var(--font-sans)",
    borderRadius: "12px",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${book.variable} ${legible.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        {AUTH_ENABLED ? <ClerkProvider appearance={CLERK_APPEARANCE}>
          {children}
          <SyncAgent />
        </ClerkProvider> : children}
        <Tooltips />
        {/* Plausible: cookieless page views, from the production site only, so previews and local runs never count. */}
        {process.env.VERCEL_ENV === "production" && <Script defer data-domain="usegloss.io" src="https://plausible.io/js/script.js" strategy="afterInteractive" />}
      </body>
    </html>
  );
}
