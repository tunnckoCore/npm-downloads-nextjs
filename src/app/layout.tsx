import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";

import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import {
  DEFAULT_THEME_PRESET,
  getThemePresetHref,
  isThemePreset,
  THEME_COOKIE_KEY,
  THEME_PRESET_LINK_ID,
} from "@/lib/theme-presets";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "npm downloads",
  description: "Analyze and visualize download stats for npm packages.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const storedThemePreset = cookieStore.get(THEME_COOKIE_KEY)?.value;
  const initialThemePreset =
    storedThemePreset && isThemePreset(storedThemePreset)
      ? storedThemePreset
      : DEFAULT_THEME_PRESET;

  return (
    <html
      lang="en"
      className="dark"
      data-theme={initialThemePreset}
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}
      >
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
      </body>
    </html>
  );
}
