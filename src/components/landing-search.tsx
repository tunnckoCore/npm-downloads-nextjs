import { Suspense } from "react";

import { LandingSearchForm } from "@/components/landing-search-form";
import { ThemePresetSwitcher } from "@/components/theme-preset-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LandingSearch() {
  return (
    <section className="w-full space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            npm downloads
          </h1>
          <p className="text-lg font-semibold text-muted-foreground">
            Analyze and visualize download stats for npm packages and authors.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ThemePresetSwitcher />
          <ThemeToggle />
        </div>
      </div>

      <Suspense fallback={<LandingSearchFormFallback />}>
        <LandingSearchForm />
      </Suspense>
    </section>
  );
}

function LandingSearchFormFallback() {
  return (
    <form className="mt-8 grid grid-cols-6 gap-2 md:grid-cols-12">
      <div className="col-span-2 inline-flex border border-input bg-secondary/40">
        <Button
          type="button"
          variant="ghost"
          className="cursor-pointer p-0 px-4"
          disabled
        >
          Author
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="cursor-pointer p-0 px-4"
          disabled
        >
          Package
        </Button>
      </div>

      <Input
        name="query"
        placeholder="npm package name"
        defaultValue=""
        className="col-span-4 cursor-pointer bg-background md:col-span-4"
      />
      <Input
        name="from"
        type="date"
        defaultValue=""
        className="col-span-2 cursor-pointer bg-background [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      <Input
        name="to"
        type="date"
        defaultValue=""
        className="col-span-2 cursor-pointer bg-background [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      <Button
        type="button"
        className="col-span-2 cursor-pointer border-primary px-4 text-primary-foreground"
        disabled
      >
        Search
      </Button>
    </form>
  );
}
