import { atomWithStorage } from "jotai/utils";

export const sidebarCollapsedAtom = atomWithStorage<boolean>("metacore:sidebar-collapsed", false);
