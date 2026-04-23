"use client";

import { GithubLogoIcon, InfoIcon } from "@phosphor-icons/react";
import Link from "next/link";

import { ThemePresetSwitcher } from "@/components/theme-preset-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GITHUB_REPO_URL = "https://github.com/tunnckoCore/npm-downloads-nextjs";

const iconButtonClassName = cn(
  buttonVariants({ size: "icon-sm", variant: "outline" }),
  "h-8 px-4"
);

export function HeaderControls() {
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <ThemePresetSwitcher />
      <ThemeToggle />
      <Link
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Open GitHub repository"
        className={iconButtonClassName}
      >
        <GithubLogoIcon weight="regular" />
      </Link>
      <Link
        href="/about"
        aria-label="Open About page"
        className={iconButtonClassName}
      >
        <InfoIcon weight="regular" />
      </Link>
    </div>
  );
}
