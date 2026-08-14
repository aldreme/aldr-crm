import { getSession, logoutUrl } from "@/lib/api/crm-api";
import type { CrmSessionUser } from "@/lib/types/crm";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface CrmSessionContextType {
  user: CrmSessionUser | null;
  loading: boolean;
  logout: () => void;
  refresh: () => Promise<void>;
}

const CrmSessionContext = createContext<CrmSessionContextType | undefined>(undefined);

export function CrmSessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CrmSessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const session = await getSession();
      setUser(session);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    window.location.href = logoutUrl();
  }, []);

  return (
    <CrmSessionContext.Provider value={{ user, loading, logout, refresh }}>
      {children}
    </CrmSessionContext.Provider>
  );
}

export function useCrmSession() {
  const context = useContext(CrmSessionContext);
  if (!context) throw new Error("useCrmSession must be used within CrmSessionProvider");
  return context;
}
