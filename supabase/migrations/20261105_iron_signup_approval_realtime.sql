-- IRONLab: user-initiated sign-up remains pending until owner/admin approval.
-- Apply to the EXISTING Supabase project after backing up policies. Do not rerun schema.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.iron_create_pending_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  requested_name text;
BEGIN
  requested_name := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'display_name', '')), '');
  INSERT INTO public.profiles (id, display_name, role, active)
  VALUES (
    NEW.id,
    left(COALESCE(requested_name, NULLIF(split_part(COALESCE(NEW.email,''), '@', 1), ''), 'Novo integrante'), 120),
    'member',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS iron_create_profile_on_signup ON auth.users;
CREATE TRIGGER iron_create_profile_on_signup
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION public.iron_create_pending_profile();

-- Backfill auth accounts created before this trigger was installed.
-- Existing profiles (including the owner) are never modified or auto-approved.
INSERT INTO public.profiles (id, display_name, role, active)
SELECT u.id,
       left(COALESCE(
         NULLIF(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
         NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
         'Novo integrante'
       ), 120),
       'member', false
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Admin invitations use a service-role Edge Function. Their pending profile already
-- exists after the auth.users trigger, so an authorized upsert must be allowed.
-- The service-role key must NEVER be exposed to the IRONLab frontend.
CREATE OR REPLACE FUNCTION public.profile_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE actor_role public.iron_role;
BEGIN
  IF tg_op = 'DELETE' THEN RAISE EXCEPTION 'Profiles cannot be deleted'; END IF;
  IF tg_op = 'UPDATE' THEN
    IF auth.role() = 'service_role' THEN
      RETURN NEW;
    END IF;
    SELECT role INTO actor_role FROM public.profiles
      WHERE id=auth.uid() AND active;
    IF OLD.role='owner' OR NEW.role='owner' THEN RAISE EXCEPTION 'Owner role is protected'; END IF;
    IF actor_role IS DISTINCT FROM 'owner' AND actor_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
    IF OLD.id IS DISTINCT FROM NEW.id OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Immutable fields';
    END IF;
    IF NEW.active AND NOT OLD.active AND NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id=NEW.id AND u.email_confirmed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Confirm the account email before approving access' USING ERRCODE='42501';
    END IF;
    IF OLD.id=auth.uid() AND (NEW.active=false OR NEW.role<>OLD.role) THEN
      RAISE EXCEPTION 'Cannot suspend or demote yourself';
    END IF;
    INSERT INTO public.audit_logs(actor_id,target_id,action,before_state,after_state)
      VALUES(auth.uid(),OLD.id,'profile.update',to_jsonb(OLD),to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;

-- Only staff members may see e-mail verification status. The general profiles
-- SELECT policy continues to hide other users from non-administrators.
CREATE OR REPLACE FUNCTION public.iron_admin_list_accounts()
RETURNS TABLE (
  id uuid, display_name text, role public.iron_role, active boolean,
  email text, email_confirmed boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT p.id,p.display_name,p.role,p.active,u.email,
           u.email_confirmed_at IS NOT NULL
    FROM public.profiles p JOIN auth.users u ON u.id=p.id
    ORDER BY p.display_name;
END;
$;
REVOKE ALL ON FUNCTION public.iron_admin_list_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iron_admin_list_accounts() TO authenticated;

-- Users must be active to create teams. SECURITY DEFINER avoids profiles SELECT/RLS
-- ambiguity inside the team creation policy.
DROP POLICY IF EXISTS iron_team_create ON public.iron_teams;
CREATE POLICY iron_team_create ON public.iron_teams
  FOR INSERT TO authenticated WITH CHECK (
    created_by = (SELECT auth.uid()) AND public.is_active()
  );

-- Members may collaborate on projects; viewers remain read-only.
CREATE OR REPLACE FUNCTION public.iron_can_access_team(p_team uuid, p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.iron_teams t
    JOIN public.profiles p ON p.id=auth.uid() AND p.active
    WHERE t.id=p_team AND (
      t.created_by=auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.iron_team_members m
        WHERE m.team_id=t.id AND m.user_id=auth.uid()
          AND (NOT p_write OR m.role IN ('admin','mentor','member'))
      )
    )
  )
$$;
REVOKE ALL ON FUNCTION public.iron_can_access_team(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iron_can_access_team(uuid,boolean) TO authenticated;

-- Only a team creator or a team admin can add already-approved profiles.
-- Exact e-mail lookup occurs inside the trusted function, not through client
-- access to auth.users. A team admin cannot promote another team admin.
CREATE OR REPLACE FUNCTION public.iron_add_team_member_by_email(
  p_team_id uuid, p_email text, p_role text DEFAULT 'member'
)
RETURNS TABLE(user_id uuid, display_name text, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  creator_id uuid;
  target_id uuid;
  target_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active() THEN
    RAISE EXCEPTION 'Active authentication required' USING ERRCODE='42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('admin','mentor','member','viewer') THEN
    RAISE EXCEPTION 'Invalid team role';
  END IF;
  SELECT t.created_by INTO creator_id
    FROM public.iron_teams t WHERE t.id=p_team_id;
  IF creator_id IS NULL OR NOT (
    creator_id=auth.uid()
    OR EXISTS (SELECT 1 FROM public.iron_team_members m
               WHERE m.team_id=p_team_id AND m.user_id=auth.uid() AND m.role='admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage this team' USING ERRCODE='42501';
  END IF;
  IF p_role='admin' AND creator_id<>auth.uid() THEN
    RAISE EXCEPTION 'Only team creators may appoint admins' USING ERRCODE='42501';
  END IF;
  SELECT p.id, p.display_name INTO target_id, target_name
    FROM auth.users u JOIN public.profiles p ON p.id=u.id AND p.active
    WHERE lower(u.email)=lower(btrim(p_email))
    LIMIT 1;
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'No approved IRONLab account for this e-mail';
  END IF;
  IF target_id=creator_id THEN
    RAISE EXCEPTION 'Creator membership is protected';
  END IF;
  INSERT INTO public.iron_team_members(team_id,user_id,role)
    VALUES(p_team_id,target_id,p_role)
    ON CONFLICT(team_id,user_id) DO UPDATE SET role=excluded.role;
  RETURN QUERY SELECT target_id, target_name, p_role;
END;
$$;
REVOKE ALL ON FUNCTION public.iron_add_team_member_by_email(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iron_add_team_member_by_email(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.iron_list_team_members(p_team_id uuid)
RETURNS TABLE(user_id uuid, display_name text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.iron_can_access_team(p_team_id) THEN
    RAISE EXCEPTION 'No access to team' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT m.user_id, p.display_name, m.role
    FROM public.iron_team_members m
    JOIN public.profiles p ON p.id=m.user_id
    WHERE m.team_id=p_team_id AND p.active
    ORDER BY p.display_name;
END;
$$;
REVOKE ALL ON FUNCTION public.iron_list_team_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iron_list_team_members(uuid) TO authenticated;

-- Enable secure change notifications for projects only. SELECT RLS gates events.
-- Do not publish profiles, audit_logs or auth.users.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    EXECUTE 'CREATE PUBLICATION supabase_realtime';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime'
                   AND schemaname = 'public' AND tablename = 'iron_projects') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.iron_projects';
  END IF;
END;
$$;
COMMIT;

-- Required Supabase dashboard setting:
-- Authentication > Providers > Email: Allow new users to sign up = ON;
-- Confirm email = ON is recommended. The user remains inactive in public.profiles
-- until explicitly approved by an owner/admin.
