import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import {
  DEFAULT_THEME_PRESET,
  getThemePresetHref,
  isThemePreset,
  THEME_COOKIE_KEY,
  THEME_PRESET_LINK_ID,
} from "@/lib/theme-presets";
import type { ThemePreset } from "@/lib/theme-presets";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function resolveSiteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined);

  if (!raw) {
    return "http://localhost:3000";
  }

  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

const siteUrl = resolveSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "npm downloads",
    template: "%s | npm downloads",
  },
  description: "Analyze and visualize download stats for npm packages.",
  openGraph: {
    title: "npm downloads",
    description: "Analyze and visualize download stats for npm packages.",
    images: ["/og/home.png"],
    siteName: "npm downloads",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "npm downloads",
    description: "Analyze and visualize download stats for npm packages.",
    images: ["/og/home.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark"
      data-theme={DEFAULT_THEME_PRESET}
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <Suspense
          fallback={
            <RuntimeTree initialThemePreset={DEFAULT_THEME_PRESET}>
              {children}
            </RuntimeTree>
          }
        >
          <CookieBoundRuntime>{children}</CookieBoundRuntime>
        </Suspense>
      </body>
    </html>
  );
}

async function CookieBoundRuntime({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const storedThemePreset = cookieStore.get(THEME_COOKIE_KEY)?.value;
  const initialThemePreset =
    storedThemePreset && isThemePreset(storedThemePreset)
      ? storedThemePreset
      : DEFAULT_THEME_PRESET;

  return (
    <RuntimeTree initialThemePreset={initialThemePreset}>
      {children}
    </RuntimeTree>
  );
}

function RuntimeTree({
  children,
  initialThemePreset,
}: {
  children: React.ReactNode;
  initialThemePreset: ThemePreset;
}) {
  return (
    <>
      <link
        id={THEME_PRESET_LINK_ID}
        rel="stylesheet"
        href={getThemePresetHref(initialThemePreset)}
        precedence="default"
      />
      <Providers>
        {children}
        <Toaster position="top-center" />
      </Providers>
    </>
  );
}
