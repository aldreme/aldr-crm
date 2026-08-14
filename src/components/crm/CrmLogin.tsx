import { loginUrl } from "@/lib/api/crm-api";
import { CrmI18nProvider, useCrmTranslation } from "./CrmI18nProvider";
import { Button } from "@heroui/react";
import { Table2 } from "lucide-react";

function FeishuLogo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 4.2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3Zm0 12c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08A6.98 6.98 0 0 1 12 18.2Z" />
    </svg>
  );
}

function CrmLoginContent() {
  const { t } = useCrmTranslation();
  return (
    <div className="bg-gray-50 dark:bg-zinc-950 flex items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="mb-10 text-center space-y-4">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-blue-600 items-center justify-center shadow-2xl shadow-blue-500/40">
            <Table2 className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              {t("crm.title")}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">Advanced Laboratory Durable Reliable</p>
          </div>
        </div>

        <div className="p-8 space-y-6 bg-white dark:bg-zinc-900 rounded-3xl shadow-xl border border-gray-100 dark:border-zinc-800">
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {t("crm.login.title")}
            </h2>
            <p className="text-sm text-gray-500">{t("crm.login.subtitle")}</p>
          </div>
          <Button
            className="w-full h-12 font-semibold shadow-lg shadow-blue-500/30"
            color="primary"
            radius="full"
            startContent={<FeishuLogo />}
            onPress={() => {
              window.location.href = loginUrl(window.location.origin);
            }}
          >
            {t("crm.login.button")}
          </Button>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} ALDR. All rights reserved.
        </p>
      </div>
    </div>
  );
}

export function CrmLogin() {
  return (
    <CrmI18nProvider>
      <CrmLoginContent />
    </CrmI18nProvider>
  );
}
