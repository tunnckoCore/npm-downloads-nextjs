"use client";

import { useCallback, useEffect, useState } from "react";

import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  applyThemePreset,
  DEFAULT_THEME_PRESET,
  isThemePreset,
  THEME_PRESETS,
  THEME_STORAGE_KEY,
} from "@/lib/theme-presets";
import type { ThemePreset } from "@/lib/theme-presets";

export function ThemePresetSwitcher() {
  const [preset, setPreset] = useState<ThemePreset>(DEFAULT_THEME_PRESET);

  useEffect(() => {
    const datasetPreset = document.documentElement.dataset.theme as
      | ThemePreset
      | undefined;
    const storedPreset = window.localStorage.getItem(THEME_STORAGE_KEY);
    const storedThemePreset = isThemePreset(storedPreset ?? "")
      ? (storedPreset as ThemePreset)
      : null;
    let nextPreset: ThemePreset = DEFAULT_THEME_PRESET;

    if (datasetPreset && isThemePreset(datasetPreset)) {
      nextPreset = datasetPreset;
    }

    if (storedThemePreset) {
      nextPreset = storedThemePreset;
    }

    applyThemePreset(nextPreset);
    setPreset(nextPreset);
  }, []);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextPreset = event.currentTarget.value as ThemePreset;

      applyThemePreset(nextPreset);
      setPreset(nextPreset);
    },
    []
  );

  return (
    <NativeSelect
      aria-label="Select color theme"
      value={preset}
      onChange={handleChange}
      className="w-36 cursor-pointer"
    >
      {THEME_PRESETS.map((themePreset) => (
        <NativeSelectOption
          className="cursor-pointer"
          key={themePreset.value}
          value={themePreset.value}
        >
          {themePreset.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
