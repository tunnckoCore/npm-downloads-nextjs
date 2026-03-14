"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { ThemePresetSwitcher } from "@/components/theme-preset-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultDateRange } from "@/lib/npm/date";
import { encodePackagePath } from "@/lib/npm/routes";
import { INTERVALS } from "@/lib/npm/types";
import { packageExists } from "@/lib/package-exists";
import { cn } from "@/lib/utils";

export function SubjectSearch({
  packageName,
  className,
  isLoading = false,
  isSearchDisabled = false,
  onCancel,
  onSearchStart,
}: {
  packageName?: string;
  className?: string;
  isLoading?: boolean;
  isSearchDisabled?: boolean;
  onCancel?: () => void;
  onSearchStart?: (searchType: "range" | "route") => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmittingSearch, setIsSubmittingSearch] = useState(false);
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
        return false;
      }

      const from = nextFrom || queryState.from;
      const to = nextTo || queryState.to;
      if (from >= to) {
        toast.error("Start date must be earlier than end date.");
        return false;
      }

      try {
        const exists = await packageExists(nextPackage);
        if (!exists) {
          toast.error(`Package "${nextPackage}" was not found.`);
          return false;
        }
      } catch {
        toast.error("Could not validate the package right now.");
        return false;
      }

      if (
        packageName === nextPackage &&
        from === queryState.from &&
        to === queryState.to
      ) {
        return false;
      }

      const searchParams = new URLSearchParams({
        from,
        to,
        interval: queryState.interval,
      });
      const nextHref = `/package/${encodePackagePath(nextPackage)}?${searchParams.toString()}`;

      onSearchStart?.(
        packageName && packageName !== nextPackage ? "route" : "range"
      );

      startTransition(() => {
        navigateWithTransition(nextHref);
      });
      return true;
    },
    [
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
      setIsSubmittingSearch(true);
      const started = await submitToPackage(new FormData(event.currentTarget));
      if (!started) {
        setIsSubmittingSearch(false);
      }
    },
    [submitToPackage]
  );

  useEffect(() => {
    if (isLoading && isSubmittingSearch) {
      setIsSubmittingSearch(false);
    }
  }, [isLoading, isSubmittingSearch]);

  const handleCancel = useCallback(() => {
    setIsSubmittingSearch(false);
    onCancel?.();
  }, [onCancel]);

  const handleHomeClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      navigateWithTransition("/");
    },
    [navigateWithTransition]
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
        isLoading={isLoading || isSubmittingSearch}
        isSearchDisabled={isSearchDisabled}
        isPending={isPending}
        onCancel={handleCancel}
        onSubmit={handleSubmit}
      />
    </section>
  );
}

function SearchForm({
  initialFrom,
  initialQuery,
  initialTo,
  isLoading,
  isSearchDisabled,
  isPending,
  onCancel,
  onSubmit,
}: {
  initialFrom: string;
  initialQuery: string;
  initialTo: string;
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

  return (
    <form
      className="mt-8 grid grid-cols-6 gap-2 md:grid-cols-12"
      onSubmit={onSubmit}
    >
      <Input
        name="query"
        placeholder="npm package name"
        value={formState.query}
        onChange={handleFieldChange}
        className={cn("col-span-6 cursor-pointer bg-background md:col-span-6")}
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
      {isLoading ? (
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
          disabled={isSearchDisabled || isPending}
        >
          Search
        </Button>
      )}
    </form>
  );
}
