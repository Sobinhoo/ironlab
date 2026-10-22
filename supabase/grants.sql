-- Execute UMA VEZ após schema.sql no SQL Editor.
-- Necessário quando "Automatically expose new tables" foi desativado.
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.audit_logs to authenticated;
-- RLS e a trigger profile_guard continuam aplicáveis.
-- Nunca conceda INSERT ou DELETE em profiles/audit_logs aos clientes.
