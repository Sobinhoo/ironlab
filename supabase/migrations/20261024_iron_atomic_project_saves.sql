-- Atomic revision history and compare-and-swap project saves.
-- Apply after 20261023_iron_cloud_foundation.sql.
DROP POLICY IF EXISTS iron_project_edit ON public.iron_projects;
REVOKE UPDATE ON public.iron_projects FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.iron_project_revisions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.iron_save_project(
  p_project_id uuid,
  p_expected_revision bigint,
  p_document jsonb,
  p_name text
) RETURNS public.iron_projects
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  current_project public.iron_projects;
  updated_project public.iron_projects;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR
     octet_length(p_document::text) > 2097152 THEN
    RAISE EXCEPTION 'Invalid project document';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Invalid project name';
  END IF;
  SELECT * INTO current_project FROM public.iron_projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.iron_can_access_team(current_project.team_id,true) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';
  END IF;
  IF current_project.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Revision conflict' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.iron_project_revisions(project_id,revision,document,saved_by)
  VALUES (current_project.id,current_project.revision,current_project.document,auth.uid());
  UPDATE public.iron_projects
    SET document=p_document,name=btrim(p_name),revision=revision+1,
        updated_by=auth.uid(),updated_at=now()
    WHERE id=p_project_id
    RETURNING * INTO updated_project;
  RETURN updated_project;
END $$;
REVOKE ALL ON FUNCTION public.iron_save_project(uuid,bigint,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iron_save_project(uuid,bigint,jsonb,text) TO authenticated;

-- Only authorized writers can create a project. Creation is covered by RLS.
-- Existing revision history remains read-only to clients.
