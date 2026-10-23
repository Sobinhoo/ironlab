-- IRONLab: allow Auth user deletion to cascade into profiles safely.
-- Direct profile deletion remains blocked while its auth.users parent exists.
-- Apply to Supabase SQL Editor or via your migration deployment process.
CREATE OR REPLACE FUNCTION public.profile_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  actor_role public.iron_role;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- When auth.users is deleted, its FK ON DELETE CASCADE removes the
    -- related profile. At this point the parent auth.users row is gone.
    -- Direct attempts to delete an existing user's profile remain forbidden.
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.id) THEN
      RAISE EXCEPTION 'Profiles cannot be deleted directly';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT role INTO actor_role
    FROM public.profiles
    WHERE id = auth.uid() AND active;

    IF OLD.role = 'owner' OR NEW.role = 'owner' THEN
      RAISE EXCEPTION 'Owner role is protected';
    END IF;
    IF actor_role IS DISTINCT FROM 'owner'
       AND actor_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Immutable fields';
    END IF;
    IF OLD.id = auth.uid()
       AND (NEW.active = false OR NEW.role <> OLD.role) THEN
      RAISE EXCEPTION 'Cannot suspend or demote yourself';
    END IF;

    INSERT INTO public.audit_logs
      (actor_id, target_id, action, before_state, after_state)
    VALUES
      (auth.uid(), OLD.id, 'profile.update', to_jsonb(OLD), to_jsonb(NEW));
  END IF;

  RETURN NEW;
END;
$function$;
