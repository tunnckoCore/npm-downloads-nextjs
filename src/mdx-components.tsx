import type { MDXComponents } from "mdx/types";

import { cn } from "@/lib/utils";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    a: ({ className, ...props }) => (
      <a
        className={cn(
          "underline underline-offset-4 transition-colors hover:text-foreground",
          className
        )}
        {...props}
      />
    ),
    code: ({ className, ...props }) => (
      <code
        className={cn("bg-secondary px-1.5 py-0.5 text-xs", className)}
        {...props}
      />
    ),
    h1: ({ className, ...props }) => (
      <h1 className={cn("text-3xl font-semibold tracking-tight", className)} {...props} />
    ),
    h2: ({ className, ...props }) => (
      <h2 className={cn("text-2xl font-semibold tracking-tight", className)} {...props} />
    ),
    h3: ({ className, ...props }) => (
      <h3 className={cn("text-xl font-semibold tracking-tight", className)} {...props} />
    ),
    hr: ({ className, ...props }) => (
      <hr className={cn("border-border/60", className)} {...props} />
    ),
    li: ({ className, ...props }) => (
      <li className={cn("leading-7 text-muted-foreground", className)} {...props} />
    ),
    p: ({ className, ...props }) => (
      <p className={cn("leading-7 text-muted-foreground", className)} {...props} />
    ),
    strong: ({ className, ...props }) => (
      <strong className={cn("font-semibold text-foreground", className)} {...props} />
    ),
    ul: ({ className, ...props }) => (
      <ul className={cn("ml-6 list-disc space-y-2", className)} {...props} />
    ),
    ...components,
  };
}
