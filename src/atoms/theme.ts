import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type Theme = "light" | "dark" | "system";

export const themeAtom = atomWithStorage<Theme>("metacore:theme", "dark");

export const effectiveThemeAtom = atom<"light" | "dark">((get) => {
  const theme = get(themeAtom);
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
});
