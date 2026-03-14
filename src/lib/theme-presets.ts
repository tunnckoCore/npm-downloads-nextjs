export const THEME_STORAGE_KEY = "npm-downloads-theme";
export const THEME_COOKIE_KEY = "npm-downloads-theme";
export const DEFAULT_THEME_PRESET = "amethyst-haze";
export const THEME_PRESET_LINK_ID = "theme-preset-stylesheet";

export const THEME_PRESETS = [
  {
    label: "Amethyst Haze",
    value: "amethyst-haze",
  },
  // {
  //   label: "Astro Vista",
  //   value: "astro-vista",
  // },
  {
    label: "T3 Chat",
    value: "t3chat",
  },
] as const;

export type ThemePreset = (typeof THEME_PRESETS)[number]["value"];

export function getThemePresetHref(preset: ThemePreset) {
  return `/theme-presets/${preset}`;
}

export function isThemePreset(value: string): value is ThemePreset {
  return THEME_PRESETS.some((preset) => preset.value === value);
}

export function applyThemePreset(preset: ThemePreset) {
  const root = document.documentElement;
  const existingLink = document.querySelector(
    `#${THEME_PRESET_LINK_ID}`
  ) as HTMLLinkElement | null;

  root.dataset.theme = preset;

  const nextLink =
    existingLink ??
    Object.assign(document.createElement("link"), {
      id: THEME_PRESET_LINK_ID,
      rel: "stylesheet",
    });

  nextLink.href = getThemePresetHref(preset);

  if (!existingLink) {
    document.head.append(nextLink);
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, preset);
  window.cookieStore?.set({
    name: THEME_COOKIE_KEY,
    value: preset,
    path: "/",
    sameSite: "lax",
    expires: Date.now() + 31_536_000_000,
  });
}
