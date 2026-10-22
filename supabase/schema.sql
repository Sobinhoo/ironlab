-- IRONLab v0.28: execute in Supabase SQL editor (new project).
create type public.iron_role as enum ('owner','admin','mentor','member','viewer');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(trim(display_name)) between 1 and 120),
 role public.iron_role not null default 'member',
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.audit_logs (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 target_id uuid,
 action text not null,
 before_state jsonb,
 after_state jsonb,
 created_at timestamptz not null default now()
);
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and active and role in ('owner','admin'));
$$;
create or replace function public.is_active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and active);
$$;
create or replace function public.profile_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare actor_role public.iron_role;
begin
 if tg_op='DELETE' then raise exception 'Profiles cannot be deleted'; end if;
 if tg_op='UPDATE' then
  select role into actor_role from public.profiles where id=auth.uid() and active;
  if old.role='owner' or new.role='owner' then raise exception 'Owner role is protected'; end if;
  if actor_role is distinct from 'owner' and actor_role is distinct from 'admin' then raise exception 'Not authorized'; end if;
  if old.id is distinct from new.id or old.created_at is distinct from new.created_at then raise exception 'Immutable fields'; end if;
  if old.id=auth.uid() and (new.active=false or new.role<>old.role) then raise exception 'Cannot suspend or demote yourself'; end if;
  insert into public.audit_logs(actor_id,target_id,action,before_state,after_state) values(auth.uid(),old.id,'profile.update',to_jsonb(old),to_jsonb(new));
 end if;
 return new;
end;$$;
create trigger profile_guard before update or delete on public.profiles for each row execute function public.profile_guard();
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;
create policy profile_select on public.profiles for select to authenticated using (id=(select auth.uid()) or public.is_staff());
create policy profile_update on public.profiles for update to authenticated using (public.is_staff() and role<>'owner') with check (public.is_staff() and role<>'owner');
create policy audit_select on public.audit_logs for select to authenticated using (public.is_staff());
-- Never allow direct client INSERT into profiles or audit_logs. Create users via a trusted Edge Function.
-- Bootstrap owner only from SQL editor after creating the first Auth user:
-- insert into public.profiles(id,display_name,role) values ('AUTH_USER_UUID','Administrador principal','owner');
