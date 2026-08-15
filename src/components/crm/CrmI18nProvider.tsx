import en_us from "@/i18n/en.json";
import zh_cn from "@/i18n/zh.json";
import { createContext, useContext, useEffect, useState } from "react";

export type CrmLocale = "en" | "zh";

const translations: Record<CrmLocale, Record<string, string>> = {
  en: en_us as unknown as Record<string, string>,
  zh: zh_cn as unknown as Record<string, string>,
};

interface CrmI18nContextType {
  locale: CrmLocale;
  setLocale: (locale: CrmLocale) => void;
  t: (key: string) => string;
}

const CrmI18nContext = createContext<CrmI18nContextType | undefined>(undefined);

export function CrmI18nProvider({ children }: { children: React.ReactNode }) {
  // Default to Chinese: the CRM data (Feishu table/field names) is Chinese and
  // the primary users are the Chinese ALDR team.
  const [locale, setLocaleState] = useState<CrmLocale>("zh");

  useEffect(() => {
    const saved = localStorage.getItem("crm_locale") as CrmLocale;
    if (saved === "en" || saved === "zh") setLocaleState(saved);
  }, []);

  const setLocale = (next: CrmLocale) => {
    setLocaleState(next);
    localStorage.setItem("crm_locale", next);
  };

  const t = (key: string): string => {
    const result = translations[locale][key];
    if (!result && locale !== "en") return translations.en[key] || key;
    return result || key;
  };

  return (
    <CrmI18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </CrmI18nContext.Provider>
  );
}

export function useCrmTranslation() {
  const context = useContext(CrmI18nContext);
  if (!context) throw new Error("useCrmTranslation must be used within CrmI18nProvider");
  return context;
}
