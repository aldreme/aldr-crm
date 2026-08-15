import { tableLayouts } from "@/generated/crm/manifest";
import { useCrmSession } from "./CrmSessionProvider";
import { type CrmLocale, useCrmTranslation } from "./CrmI18nProvider";
import { CrmDialogContainer } from "./CrmDialogContainer";
import { cn } from "@/lib/utils";
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  HeroUIProvider,
} from "@heroui/react";
import {
  ChevronDown,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Table2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

interface CrmLayoutProps {
  currentTableId?: string;
  children: React.ReactNode;
}

export function CrmLayout({ currentTableId, children }: CrmLayoutProps) {
  const { t, locale, setLocale } = useCrmTranslation();
  const { user, logout } = useCrmSession();
  const { pathname: path } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <HeroUIProvider>
      <div className="flex h-screen bg-gray-50 dark:bg-zinc-950">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={closeSidebar}
            aria-hidden
          />
        )}

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-r border-gray-200 dark:border-zinc-800 flex flex-col transition-transform duration-300",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
            "lg:translate-x-0",
          )}
        >
          <div className="flex items-center gap-2 px-6 h-16 border-b border-gray-100 dark:border-zinc-800/50">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Table2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
              {t("crm.title")}
            </span>
            <button
              onClick={closeSidebar}
              className="lg:hidden ml-auto p-2 -mr-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            <Link
              to="/"
              onClick={closeSidebar}
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
                  onClick={closeSidebar}
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
            <Dropdown placement="top-start">
              <DropdownTrigger>
                <button className="mb-3 flex items-center w-full px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
                  <Languages className="w-4 h-4 mr-3" />
                  <span className="flex-1 text-left">
                    {locale === "zh" ? t("crm.locale.zh") : t("crm.locale.en")}
                  </span>
                  <ChevronDown className="w-4 h-4 opacity-50" />
                </button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label={t("crm.locale.switch")}
                selectionMode="single"
                selectedKeys={new Set([locale])}
                disallowEmptySelection
                onAction={(key) => setLocale(key as CrmLocale)}
              >
                <DropdownItem key="zh">{t("crm.locale.zh")}</DropdownItem>
                <DropdownItem key="en">{t("crm.locale.en")}</DropdownItem>
              </DropdownMenu>
            </Dropdown>
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

        <main className="flex-1 lg:ml-64 overflow-x-hidden overflow-y-auto">
          <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-zinc-800">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-bold tracking-tight text-gray-900 dark:text-white">
              {t("crm.title")}
            </span>
          </header>
          <div className="max-w-7xl mx-auto p-4 lg:p-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {children}
          </div>
        </main>
      </div>
      <CrmDialogContainer />
    </HeroUIProvider>
  );
}
