import { LandingSearch } from "@/components/landing-search";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-20">
      <div className="w-full">
        <LandingSearch />
      </div>
    </main>
  );
}
