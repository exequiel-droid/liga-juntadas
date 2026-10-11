-- Liga de Juntadas - esquema inicial
-- Pegá este archivo completo en Supabase > SQL Editor y ejecutalo.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'user');
create type public.attendance_status as enum ('present', 'justified', 'unjustified');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Nuevo jugador',
  emoji text not null default '🙂',
  title text not null default 'Miembro del grupo',
  role public.app_role not null default 'user',
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  host_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  is_closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status public.attendance_status not null,
  reason text,
  penalty integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(event_id, profile_id),
  constraint unjustified_penalty_required check (
    (status = 'unjustified' and penalty <= -1)
    or
    (status <> 'unjustified' and penalty = 0)
  )
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  collaboration integer not null check (collaboration between 1 and 10),
  cleaning integer not null check (cleaning between 1 and 10),
  behavior integer not null check (behavior between 1 and 10),
  attitude integer not null check (attitude between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, voter_id, target_id),
  constraint no_self_vote check (voter_id <> target_id)
);

create table if not exists public.point_adjustments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check (points between -50 and 50),
  description text not null check (char_length(trim(description)) > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Crear perfil automáticamente al registrarse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, emoji, title, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'Jugador'), '@', 1)),
    '🙂',
    'Miembro del grupo',
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Helper seguro para políticas RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;
alter table public.votes enable row level security;
alter table public.point_adjustments enable row level security;

-- Perfiles: todos los logueados pueden ver. SOLO el Admin puede modificarlos.
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Eventos: todos ven, solo Admin crea/edita/borra.
drop policy if exists "events_read" on public.events;
create policy "events_read" on public.events for select to authenticated using (true);

drop policy if exists "events_admin_insert" on public.events;
create policy "events_admin_insert" on public.events for insert to authenticated
with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "events_admin_update" on public.events;
create policy "events_admin_update" on public.events for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "events_admin_delete" on public.events;
create policy "events_admin_delete" on public.events for delete to authenticated using (public.is_admin());

-- Asistencia: todos ven, SOLO Admin modifica.
drop policy if exists "attendance_read" on public.attendance;
create policy "attendance_read" on public.attendance for select to authenticated using (true);

drop policy if exists "attendance_admin_insert" on public.attendance;
create policy "attendance_admin_insert" on public.attendance for insert to authenticated
with check (public.is_admin());

drop policy if exists "attendance_admin_update" on public.attendance;
create policy "attendance_admin_update" on public.attendance for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "attendance_admin_delete" on public.attendance;
create policy "attendance_admin_delete" on public.attendance for delete to authenticated using (public.is_admin());

-- Votos: todos ven para poder calcular ranking; cada usuario solo escribe SUS votos.
drop policy if exists "votes_read" on public.votes;
create policy "votes_read" on public.votes for select to authenticated using (true);

drop policy if exists "votes_own_insert" on public.votes;
create policy "votes_own_insert" on public.votes for insert to authenticated
with check (
  voter_id = auth.uid()
  and voter_id <> target_id
  and not exists (
    select 1 from public.attendance a
    where a.event_id = votes.event_id
      and a.profile_id = votes.target_id
      and a.status <> 'present'
  )
);

drop policy if exists "votes_own_update" on public.votes;
create policy "votes_own_update" on public.votes for update to authenticated
using (voter_id = auth.uid())
with check (
  voter_id = auth.uid()
  and voter_id <> target_id
  and not exists (
    select 1 from public.attendance a
    where a.event_id = votes.event_id
      and a.profile_id = votes.target_id
      and a.status <> 'present'
  )
);

-- Bonus/Malus: todos ven, SOLO Admin crea/modifica.
drop policy if exists "adjustments_read" on public.point_adjustments;
create policy "adjustments_read" on public.point_adjustments for select to authenticated using (true);

drop policy if exists "adjustments_admin_insert" on public.point_adjustments;
create policy "adjustments_admin_insert" on public.point_adjustments for insert to authenticated
with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "adjustments_admin_update" on public.point_adjustments;
create policy "adjustments_admin_update" on public.point_adjustments for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "adjustments_admin_delete" on public.point_adjustments;
create policy "adjustments_admin_delete" on public.point_adjustments for delete to authenticated using (public.is_admin());

-- IMPORTANTE:
-- 1) Creá tu cuenta desde la app.
-- 2) Reemplazá TU_EMAIL y ejecutá SOLO estas 2 líneas para convertirte en Admin:
--
-- update public.profiles
-- set role = 'admin', name = 'Exe', emoji = '🧠', title = 'El Data Lord'
-- where id = (select id from auth.users where email = 'TU_EMAIL');
