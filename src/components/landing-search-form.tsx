"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultDateRange } from "@/lib/npm/date";
import { encodePackagePath } from "@/lib/npm/routes";

function navigateWithTransition(
  router: ReturnType<typeof useRouter>,
  href: string
) {
  const startViewTransition = document.startViewTransition?.bind(document);
  if (startViewTransition) {
    startViewTransition(() => {
      router.push(href);
    });
    return;
  }

  router.push(href);
}

export function LandingSearchForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const defaults = useMemo(() => defaultDateRange(), []);
  const [formState, setFormState] = useState({
    from: defaults.from,
    query: "",
    to: defaults.to,
  });
  const href = useMemo(() => {
    const packageName = formState.query.trim();
    if (!packageName || formState.from >= formState.to) {
      return null;
    }

    const searchParams = new URLSearchParams({
      from: formState.from,
      to: formState.to,
      interval: "monthly",
    });

    return `/package/${encodePackagePath(packageName)}?${searchParams.toString()}`;
  }, [formState.from, formState.query, formState.to]);

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

  useEffect(() => {
    if (!href) {
      return;
    }

    router.prefetch(href);
  }, [href, router]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const { from, query, to } = formState;
      const packageName = query.trim();
      if (!packageName) {
        return;
      }

      if (from >= to) {
        toast.error("Start date must be earlier than end date.");
        return;
      }

      if (!href) {
        return;
      }

      startTransition(() => {
        navigateWithTransition(router, href);
      });
    },
    [formState, href, router]
  );

  return (
    <form
      className="mt-8 grid grid-cols-6 gap-2 md:grid-cols-12"
      onSubmit={handleSubmit}
    >
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

      <Input
        name="query"
        placeholder="npm package name"
        value={formState.query}
        onChange={handleFieldChange}
        className="col-span-4 cursor-pointer bg-background md:col-span-4"
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
      <Button
        type="submit"
        className="col-span-2 cursor-pointer border-primary px-4 text-primary-foreground"
        disabled={isPending}
      >
        Search
      </Button>
    </form>
  );
}
