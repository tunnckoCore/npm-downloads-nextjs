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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      className="mt-8 grid grid-cols-2 gap-2 md:grid-cols-12"
      onSubmit={handleSubmit}
    >
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
        value={formState.query}
        onChange={handleFieldChange}
        className="col-span-2 cursor-pointer bg-background md:col-span-4"
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
      <Button
        type="submit"
        className="col-span-2 cursor-pointer border-primary px-4 text-primary-foreground md:col-span-2"
        disabled={isPending}
      >
        Search
      </Button>
    </form>
  );
}
