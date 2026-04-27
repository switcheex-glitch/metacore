import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { languageAtom } from "@/atoms/language";
import { translate } from "@/i18n/strings";

export function useT() {
  const lang = useAtomValue(languageAtom);
  return useCallback(
    (key: string, params?: Record<string, string>) => translate(lang, key, params),
    [lang],
  );
}
