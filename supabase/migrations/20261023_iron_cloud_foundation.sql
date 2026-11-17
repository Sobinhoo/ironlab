-- IRONLab cloud workspace foundation. Run only after reviewing in staging.
CREATE TABLE IF NOT EXISTS public.iron_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.iron_team_members (
  team_id uuid NOT NULL REFERENCES public.iron_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','mentor','member','viewer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.iron_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.iron_teams(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iron_projects_team_idx ON public.iron_projects(team_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS public.iron_project_revisions (
  project_id uuid NOT NULL REFERENCES public.iron_projects(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  document jsonb NOT NULL,
  saved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,revision)
);
-- Membership checks run as definer to avoid recursive membership RLS.
CREATE OR REPLACE FUNCTION public.iron_can_access_team(p_team uuid, p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.iron_teams t
  JOIN public.profiles p ON p.id = auth.uid() AND p.active
  WHERE t.id = p_team AND (
    t.created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.iron_team_members m
      WHERE m.team_id=t.id AND m.user_id=auth.uid()
        AND (NOT p_write OR m.role IN ('admin','mentor'))
    )
  )
 )
$$;
REVOKE ALL ON FUNCTION public.iron_can_access_team(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iron_can_access_team(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.iron_join_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 INSERT INTO public.iron_team_members(team_id,user_id,role)
 VALUES (NEW.id,NEW.created_by,'admin');
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS iron_team_creator ON public.iron_teams;
CREATE TRIGGER iron_team_creator AFTER INSERT ON public.iron_teams
FOR EACH ROW EXECUTE FUNCTION public.iron_join_creator();

ALTER TABLE public.iron_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iron_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iron_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iron_project_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY iron_team_read ON public.iron_teams FOR SELECT TO authenticated USING (public.iron_can_access_team(id));
CREATE POLICY iron_team_create ON public.iron_teams FOR INSERT TO authenticated
 WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND active));
CREATE POLICY iron_member_read ON public.iron_team_members FOR SELECT TO authenticated USING (public.iron_can_access_team(team_id));
CREATE POLICY iron_project_read ON public.iron_projects FOR SELECT TO authenticated USING (public.iron_can_access_team(team_id));
CREATE POLICY iron_project_create ON public.iron_projects FOR INSERT TO authenticated
 WITH CHECK (public.iron_can_access_team(team_id,true) AND updated_by=auth.uid());
CREATE POLICY iron_project_edit ON public.iron_projects FOR UPDATE TO authenticated
 USING (public.iron_can_access_team(team_id,true))
 WITH CHECK (public.iron_can_access_team(team_id,true) AND updated_by=auth.uid());
CREATE POLICY iron_revision_read ON public.iron_project_revisions FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.iron_projects p WHERE p.id=project_id AND public.iron_can_access_team(p.team_id)));
-- Revision writes should be implemented by a dedicated transactional RPC,
-- not directly from clients. No INSERT/UPDATE/DELETE policies intentionally.
