import type { Metadata } from "next";
import { Suspense } from "react";

import AboutContent from "@/content/about-content.mdx";
import { LandingSearch } from "@/components/landing-search";
import { SubjectSearch } from "@/components/subject-search";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About",
  description: "About npm downloads.",
  openGraph: {
    title: "About",
    description: "About npm downloads.",
    images: ["/og/home.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "About",
    description: "About npm downloads.",
    images: ["/og/home.png"],
  },
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-4 px-5 py-10 sm:px-6 sm:py-20">
      <Suspense fallback={<LandingSearch />}>
        <SubjectSearch />
      </Suspense>

      <Card>
        <CardContent className="space-y-6 py-2 sm:space-y-8">
          <AboutContent />
        </CardContent>
      </Card>
    </main>
  );
}
