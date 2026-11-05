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

-- Admin invitations use a service-role Edge Function. Their pending profile already
-- exists after the auth.users trigger, so an authorized upsert must be allowed.
-- The service-role key must NEVER be exposed to the IRONLab frontend.
CREATE OR REPLACE FUNCTION public.profile_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $
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
    IF OLD.id=auth.uid() AND (NEW.active=false OR NEW.role<>OLD.role) THEN
      RAISE EXCEPTION 'Cannot suspend or demote yourself';
    END IF;
    INSERT INTO public.audit_logs(actor_id,target_id,action,before_state,after_state)
      VALUES(auth.uid(),OLD.id,'profile.update',to_jsonb(OLD),to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$;

-- Users must be active to create teams. SECURITY DEFINER avoids profiles SELECT/RLS
-- ambiguity inside the team creation policy.
DROP POLICY IF EXISTS iron_team_create ON public.iron_teams;
CREATE POLICY iron_team_create ON public.iron_teams
  FOR INSERT TO authenticated WITH CHECK (
    created_by = (SELECT auth.uid()) AND public.is_active()
  );

-- Enable secure change notifications. Existing SELECT RLS protects which changes a
-- subscriber can receive. Never publish audit_logs or auth.users.
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
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime'
                   AND schemaname = 'public' AND tablename = 'profiles') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  END IF;
END;
$$;
COMMIT;

-- Required Supabase dashboard setting:
-- Authentication > Providers > Email: Allow new users to sign up = ON;
-- Confirm email = ON is recommended. The user remains inactive in public.profiles
-- until explicitly approved by an owner/admin.
