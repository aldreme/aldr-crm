import { getLayoutBySlug, tableLayouts } from "@/generated/crm/manifest";
import { useTableCounts } from "@/lib/api/crm-queries";
import { Spinner } from "@heroui/react";
import { ArrowRight, Table2 } from "lucide-react";
import { Link, Navigate, Outlet, useParams } from "react-router-dom";
import { CrmI18nProvider, useCrmTranslation } from "./CrmI18nProvider";
import { CrmLayout } from "./CrmLayout";
import { CrmSessionProvider, useCrmSession } from "./CrmSessionProvider";

function Loading() {
  const { t } = useCrmTranslation();
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-zinc-950 gap-3 text-gray-500">
      <Spinner size="sm" />
      {t("crm.loading")}
    </div>
  );
}

export function Dashboard() {
  const { t } = useCrmTranslation();
  const { data } = useTableCounts(
    tableLayouts.map((l) => ({
      table_id: l.tableId,
      field_name: l.table.fields.find((f) => f.is_primary)?.field_name,
    })),
  );
  const counts = data?.counts ?? {};
  const errors = data?.errors ?? {};

  return (
    <CrmLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t("crm.dashboard.title")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">{t("crm.dashboard.subtitle")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tableLayouts.map((layout) => (
            <Link
              key={layout.tableId}
              to={`/${layout.slug}`}
              className="group p-5 rounded-3xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 shadow-sm hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800/50 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Table2 className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
              </div>
              <p className="mt-3 font-semibold text-gray-900 dark:text-white">{layout.name}</p>
              <p
                className="text-xs text-gray-400 mt-0.5"
                title={errors[layout.tableId]}
              >
                {counts[layout.tableId] != null
                  ? `${counts[layout.tableId]} ${t("crm.records")}`
                  : "—"}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </CrmLayout>
  );
}

export function TablePage() {
  const { slug } = useParams();
  const layout = slug ? getLayoutBySlug(slug) : undefined;

  if (!layout) {
    return (
      <CrmLayout>
        <div className="text-gray-500">404</div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentTableId={layout.tableId}>
      <layout.Component table={layout.table} />
    </CrmLayout>
  );
}

function CrmShell() {
  const { user, loading } = useCrmSession();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}

export function CrmApp() {
  return (
    <CrmI18nProvider>
      <CrmSessionProvider>
        <CrmShell />
      </CrmSessionProvider>
    </CrmI18nProvider>
  );
}
