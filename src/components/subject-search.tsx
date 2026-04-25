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

import { HeaderControls } from "@/components/header-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { defaultDateRange } from "@/lib/npm/date";
import { encodePackagePath } from "@/lib/npm/routes";
import { INTERVALS } from "@/lib/npm/types";
import { packageExists } from "@/lib/package-exists";
import { cn } from "@/lib/utils";

export function SubjectSearch({
  authorName,
  packageName,
  className,
  subject = "package",
  isLoading = false,
  isSearchDisabled = false,
  onCancel,
  onSearchStart,
}: {
  authorName?: string;
  packageName?: string;
  className?: string;
  subject?: "author" | "package";
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

  const submitToAuthor = useCallback(
    async (formData: FormData) => {
      const nextAuthorRaw = String(formData.get("query") ?? "").trim();
      const nextFrom = String(formData.get("from") ?? "").trim();
      const nextTo = String(formData.get("to") ?? "").trim();
      const normalizedAuthor = nextAuthorRaw.replace(/^@/, "").trim();
      if (!normalizedAuthor) {
        toast.error("Please enter a valid npm author.");
        return false;
      }

      const from = nextFrom || queryState.from;
      const to = nextTo || queryState.to;
      if (from >= to) {
        toast.error("Start date must be earlier than end date.");
        return false;
      }

      if (
        authorName?.replace(/^@/, "") === normalizedAuthor &&
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
      const nextHref = `/author/${encodeURIComponent(normalizedAuthor)}?${searchParams.toString()}`;

      onSearchStart?.(
        authorName && authorName.replace(/^@/, "") !== normalizedAuthor
          ? "route"
          : "range"
      );

      startTransition(() => {
        navigateWithTransition(nextHref);
      });
      return true;
    },
    [
      authorName,
      navigateWithTransition,
      onSearchStart,
      queryState.from,
      queryState.interval,
      queryState.to,
    ]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setIsSubmittingSearch(true);
      const formData = new FormData(event.currentTarget);
      const nextSubject =
        formData.get("subject") === "author" ? "author" : "package";
      const started =
        nextSubject === "author"
          ? await submitToAuthor(formData)
          : await submitToPackage(formData);
      if (!started) {
        setIsSubmittingSearch(false);
      }
    },
    [submitToAuthor, submitToPackage]
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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

        <HeaderControls />
      </div>

      <SearchForm
        key={`${subject}:${authorName ?? packageName ?? ""}:${queryState.from}:${queryState.to}`}
        initialFrom={queryState.from}
        initialQuery={
          subject === "author" ? (authorName ?? "") : (packageName ?? "")
        }
        initialTo={queryState.to}
        isLoading={isLoading || isSubmittingSearch}
        isSearchDisabled={isSearchDisabled}
        isPending={isPending}
        subject={subject}
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
  subject,
  onCancel,
  onSubmit,
}: {
  initialFrom: string;
  initialQuery: string;
  initialTo: string;
  isLoading: boolean;
  isSearchDisabled: boolean;
  isPending: boolean;
  subject: "author" | "package";
  onCancel?: () => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [selectedSubject, setSelectedSubject] = useState<"author" | "package">(
    subject
  );
  const [formState, setFormState] = useState({
    from: initialFrom,
    query: initialQuery,
    to: initialTo,
  });

  useEffect(() => {
    setSelectedSubject(subject);
  }, [subject]);

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
      className="mt-8 grid grid-cols-2 gap-2 md:grid-cols-12"
      onSubmit={onSubmit}
    >
      <input name="subject" type="hidden" value={selectedSubject} readOnly />
      <Tabs
        value={selectedSubject}
        onValueChange={(value) => {
          if (value === "author" || value === "package") {
            setSelectedSubject(value);
          }
        }}
        className="col-span-2 w-full md:col-span-2"
      >
        <TabsList className="w-full">
          <TabsTrigger value="author" className="cursor-pointer">
            Author
          </TabsTrigger>
          <TabsTrigger value="package" className="cursor-pointer">
            Package
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Input
        name="query"
        placeholder={
          selectedSubject === "author" ? "npm author" : "npm package name"
        }
        value={formState.query}
        onChange={handleFieldChange}
        className={cn("col-span-2 cursor-pointer bg-background md:col-span-4")}
      />
      <Input
        name="from"
        type="date"
        value={formState.from}
        onChange={handleFieldChange}
        className="col-span-1 cursor-pointer bg-background md:col-span-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      <Input
        name="to"
        type="date"
        value={formState.to}
        onChange={handleFieldChange}
        className="col-span-1 cursor-pointer bg-background md:col-span-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      {isLoading ? (
        <Button
          key="cancel"
          type="button"
          variant="secondary"
          className="col-span-2 cursor-pointer border-secondary md:col-span-2"
          onClick={onCancel}
        >
          Cancel
        </Button>
      ) : (
        <Button
          key="search"
          type="submit"
          className="col-span-2 cursor-pointer border-primary md:col-span-2"
          disabled={isSearchDisabled || isPending}
        >
          Search
        </Button>
      )}
    </form>
  );
}
