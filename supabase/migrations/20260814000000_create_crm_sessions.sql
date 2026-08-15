CREATE TABLE public.crm_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    open_id TEXT NOT NULL,
    name TEXT,
    email TEXT,
    avatar_url TEXT,
    tokens JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

-- The edge function is the only client and uses the service_role key (which
-- bypasses RLS). Enable RLS with no policies so anon/authenticated cannot access
-- the sessions via the Data API.
ALTER TABLE public.crm_sessions ENABLE ROW LEVEL SECURITY;

-- The edge function accesses this table via PostgREST using the service_role key.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sessions TO service_role;

CREATE INDEX idx_crm_sessions_expires_at ON public.crm_sessions(expires_at);
