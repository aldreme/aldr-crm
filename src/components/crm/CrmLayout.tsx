import { tableLayouts } from "@/generated/crm/manifest";
import { useCrmSession } from "./CrmSessionProvider";
import { useCrmTranslation } from "./CrmI18nProvider";
import { CrmDialogContainer } from "./CrmDialogContainer";
import { cn } from "@/lib/utils";
import { HeroUIProvider } from "@heroui/react";
import { LayoutDashboard, LogOut, Table2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

interface CrmLayoutProps {
  currentTableId?: string;
  children: React.ReactNode;
}

export function CrmLayout({ currentTableId, children }: CrmLayoutProps) {
  const { t } = useCrmTranslation();
  const { user, logout } = useCrmSession();
  const { pathname: path } = useLocation();

  return (
    <HeroUIProvider>
      <div className="flex h-screen bg-gray-50 dark:bg-zinc-950">
        <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-r border-gray-200 dark:border-zinc-800 flex flex-col">
          <div className="flex items-center gap-2 px-6 h-16 border-b border-gray-100 dark:border-zinc-800/50">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Table2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
              {t("crm.title")}
            </span>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            <Link
              to="/"
              className={cn(
                "flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all",
                path === "/"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800",
              )}
            >
              <LayoutDashboard className="w-4 h-4 mr-3" />
              {t("crm.dashboard.title")}
            </Link>
            <p className="px-3 pt-4 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {t("crm.tables")}
            </p>
            {tableLayouts.map((layout) => {
              const href = `/${layout.slug}`;
              const active = currentTableId === layout.tableId || path === href;
              return (
                <Link
                  key={layout.tableId}
                  to={href}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-xl transition-all",
                    active
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800",
                  )}
                >
                  {layout.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-100 dark:border-zinc-800/50">
            {user && (
              <div className="mb-3 flex items-center gap-2 px-1">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                    {(user.name || user.email || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {user.name || user.email}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
              </div>
            )}
            <button
              onClick={logout}
              className="flex items-center w-full px-3 py-2 text-sm font-medium text-red-600 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
            >
              <LogOut className="w-4 h-4 mr-3" />
              {t("crm.logout")}
            </button>
          </div>
        </aside>

        <main className="flex-1 ml-64 overflow-x-hidden overflow-y-auto p-6 lg:p-10">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {children}
          </div>
        </main>
      </div>
      <CrmDialogContainer />
    </HeroUIProvider>
  );
}
