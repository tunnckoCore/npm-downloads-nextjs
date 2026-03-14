"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ThemePresetSwitcher } from "@/components/theme-preset-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultDateRange } from "@/lib/npm/date";
import { encodePackagePath } from "@/lib/npm/routes";
import { INTERVALS } from "@/lib/npm/types";
import type { Interval } from "@/lib/npm/types";
import { packageExists } from "@/lib/package-exists";
import { cn } from "@/lib/utils";

type SearchMode = "landing" | "results";

export function SubjectSearch({
  mode,
  packageName,
  className,
  isLoading = false,
  isSearchDisabled = false,
  onCancel,
  onSearchStart,
}: {
  mode: SearchMode;
  packageName?: string;
  className?: string;
  isLoading?: boolean;
  isSearchDisabled?: boolean;
  onCancel?: () => void;
  onSearchStart?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const defaults = useMemo(() => defaultDateRange(), []);
  const [queryState] = useQueryStates({
    from: parseAsString.withDefault(defaults.from),
    to: parseAsString.withDefault(defaults.to),
    interval: parseAsStringLiteral(INTERVALS).withDefault("monthly"),
  });

  const navigateWithTransition = useCallback(
    (href: string) => {
      const startViewTransition = document.startViewTransition?.bind(document);
      if (startViewTransition) {
        startViewTransition(() => {
          router.push(href);
        });
        return;
      }

      router.push(href);
    },
    [router]
  );

  const submitToPackage = useCallback(
    async (formData: FormData) => {
      const nextPackage = String(formData.get("query") ?? "").trim();
      const nextFrom = String(formData.get("from") ?? "").trim();
      const nextTo = String(formData.get("to") ?? "").trim();
      if (!nextPackage) {
        return;
      }

      const from = nextFrom || queryState.from;
      const to = nextTo || queryState.to;
      if (from >= to) {
        toast.error("Start date must be earlier than end date.");
        return;
      }

      try {
        const exists = await packageExists(nextPackage);
        if (!exists) {
          toast.error(`Package "${nextPackage}" was not found.`);
          return;
        }
      } catch {
        toast.error("Could not validate the package right now.");
        return;
      }

      const searchParams = new URLSearchParams({
        from,
        to,
        interval: queryState.interval,
      });
      const nextHref = `/package/${encodePackagePath(nextPackage)}?${searchParams.toString()}`;

      if (
        mode === "results" &&
        packageName === nextPackage &&
        from === queryState.from &&
        to === queryState.to
      ) {
        return;
      }

      onSearchStart?.();

      startTransition(() => {
        navigateWithTransition(nextHref);
      });
    },
    [
      mode,
      navigateWithTransition,
      onSearchStart,
      packageName,
      queryState.from,
      queryState.interval,
      queryState.to,
    ]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await submitToPackage(new FormData(event.currentTarget));
    },
    [submitToPackage]
  );

  const handleHomeClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (mode !== "results") {
        return;
      }

      event.preventDefault();
      navigateWithTransition("/");
    },
    [mode, navigateWithTransition]
  );

  return (
    <section className={cn("w-full space-y-2", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            <Link href="/" onClick={handleHomeClick}>
              npm downloads
            </Link>
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

      <SearchForm
        key={`${packageName ?? ""}:${queryState.from}:${queryState.to}`}
        initialFrom={queryState.from}
        initialQuery={packageName ?? ""}
        initialTo={queryState.to}
        interval={queryState.interval}
        mode={mode}
        isLoading={isLoading}
        isSearchDisabled={isSearchDisabled}
        isPending={isPending}
        onCancel={onCancel}
        onSubmit={mode === "results" ? handleSubmit : undefined}
      />
    </section>
  );
}

function SearchForm({
  initialFrom,
  initialQuery,
  initialTo,
  interval,
  mode,
  isLoading,
  isSearchDisabled,
  isPending,
  onCancel,
  onSubmit,
}: {
  initialFrom: string;
  initialQuery: string;
  initialTo: string;
  interval: Interval;
  mode: SearchMode;
  isLoading: boolean;
  isSearchDisabled: boolean;
  isPending: boolean;
  onCancel?: () => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [formState, setFormState] = useState({
    from: initialFrom,
    query: initialQuery,
    to: initialTo,
  });

  const handleFieldChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = event.currentTarget;
      setFormState((current) => ({
        ...current,
        [name]: value,
      }));
    },
    []
  );

  const isActiveLoading = isLoading;

  return (
    <form
      action={mode === "landing" ? "/search" : undefined}
      className="mt-8 grid grid-cols-6 gap-2 md:grid-cols-12"
      method={mode === "landing" ? "get" : undefined}
      onSubmit={onSubmit}
    >
      {mode === "landing" ? (
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
          >
            Package
          </Button>
        </div>
      ) : null}

      {mode === "landing" ? (
        <input type="hidden" name="interval" value={interval} />
      ) : null}

      <Input
        name="query"
        placeholder="npm package name"
        value={formState.query}
        onChange={handleFieldChange}
        className={cn(
          "cursor-pointer bg-background",
          mode === "landing"
            ? "col-span-4 md:col-span-4"
            : "col-span-6 md:col-span-6"
        )}
      />
      <Input
        name="from"
        type="date"
        value={formState.from}
        onChange={handleFieldChange}
        className="col-span-2 cursor-pointer bg-background [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      <Input
        name="to"
        type="date"
        value={formState.to}
        onChange={handleFieldChange}
        className="col-span-2 cursor-pointer bg-background [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      {isActiveLoading ? (
        <Button
          key="cancel"
          type="button"
          variant="secondary"
          className="col-span-2 cursor-pointer border-secondary"
          onClick={onCancel}
        >
          Cancel
        </Button>
      ) : (
        <Button
          key="search"
          type="submit"
          className="col-span-2 cursor-pointer border-primary"
          disabled={isSearchDisabled || (isPending && mode !== "results")}
        >
          Search
        </Button>
      )}
    </form>
  );
}
