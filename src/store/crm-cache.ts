import { atom } from "jotai";
import type { CrmRecord } from "@/lib/types/crm";

// In-memory cache of linked-table records used by the link-field pickers,
// keyed by table_id. Lives for the lifetime of the page (per Astro page load)
// and clears on full navigation.
export const linkLookupCacheAtom = atom<Record<string, CrmRecord[]>>({});
