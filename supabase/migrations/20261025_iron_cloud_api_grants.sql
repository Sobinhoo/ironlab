-- Allow authenticated IRONLab clients to reach RLS-protected cloud tables.
-- RLS policies still determine which rows each user can access.
BEGIN;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON TABLE public.iron_teams TO authenticated;
GRANT SELECT ON TABLE public.iron_team_members TO authenticated;
GRANT SELECT, INSERT ON TABLE public.iron_projects TO authenticated;
GRANT SELECT ON TABLE public.iron_project_revisions TO authenticated;
-- Updates remain exclusively available through iron_save_project RPC.
REVOKE UPDATE, DELETE ON TABLE public.iron_teams FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.iron_team_members FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.iron_projects FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.iron_project_revisions FROM authenticated;
GRANT EXECUTE ON FUNCTION public.iron_can_access_team(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iron_save_project(uuid,bigint,jsonb,text) TO authenticated;
COMMIT;
