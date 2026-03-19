import { Suspense } from "react";

import { LandingSearchForm } from "@/components/landing-search-form";
import { ThemePresetSwitcher } from "@/components/theme-preset-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function LandingSearch() {
  return (
    <section className="w-full space-y-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            npm downloads
          </h1>
          <p className="text-lg font-semibold text-muted-foreground">
            Analyze and visualize download stats for npm packages and authors.
          </p>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
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
    <form className="mt-8 grid grid-cols-2 gap-2 md:grid-cols-12">
      <Tabs value="package" className="col-span-2 w-full md:col-span-2">
        <TabsList className="w-full">
          <TabsTrigger value="author" disabled className="cursor-pointer">
            Author
          </TabsTrigger>
          <TabsTrigger value="package" className="cursor-pointer">
            Package
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Input
        name="query"
        placeholder="npm package name"
        defaultValue=""
        className="col-span-2 cursor-pointer bg-background md:col-span-4"
      />
      <Input
        name="from"
        type="date"
        defaultValue=""
        className="col-span-1 cursor-pointer bg-background md:col-span-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      <Input
        name="to"
        type="date"
        defaultValue=""
        className="col-span-1 cursor-pointer bg-background md:col-span-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      <Button
        type="button"
        className="col-span-2 cursor-pointer border-primary px-4 text-primary-foreground md:col-span-2"
        disabled
      >
        Search
      </Button>
    </form>
  );
}
