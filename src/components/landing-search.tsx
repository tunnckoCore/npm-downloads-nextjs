import { ThemePresetSwitcher } from "@/components/theme-preset-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultDateRange } from "@/lib/npm/date";

export function LandingSearch() {
  const defaults = defaultDateRange();

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

      <form action="/search" className="mt-8 grid grid-cols-6 gap-2 md:grid-cols-12" method="get">
        <div className="col-span-2 inline-flex border border-input bg-secondary/40">
          <Button type="button" variant="ghost" className="cursor-pointer p-0 px-4" disabled>
            Author
          </Button>
          <Button type="button" variant="secondary" className="cursor-pointer p-0 px-4">
            Package
          </Button>
        </div>

        <input type="hidden" name="interval" value="monthly" />

        <Input
          name="query"
          placeholder="npm package name"
          defaultValue=""
          className="col-span-4 cursor-pointer bg-background md:col-span-4"
        />
        <Input
          name="from"
          type="date"
          defaultValue={defaults.from}
          className="col-span-2 cursor-pointer bg-background [&::-webkit-calendar-picker-indicator]:cursor-pointer"
        />
        <Input
          name="to"
          type="date"
          defaultValue={defaults.to}
          className="col-span-2 cursor-pointer bg-background [&::-webkit-calendar-picker-indicator]:cursor-pointer"
        />
        <Button
          type="submit"
          className="col-span-2 cursor-pointer px-4 text-primary-foreground border-primary"
        >
          Search
        </Button>
      </form>
    </section>
  );
}
