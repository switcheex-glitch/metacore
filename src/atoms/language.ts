import { atomWithStorage } from "jotai/utils";

export type Language = "ru" | "en";

export const languageAtom = atomWithStorage<Language>("metacore:language", "ru");
