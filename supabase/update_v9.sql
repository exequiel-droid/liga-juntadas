-- Liga de Juntadas v9 — migración consolidada
-- Ejecutar UNA sola vez en Supabase > SQL Editor.
-- Es idempotente: consolida revisión de votos, votos históricos y permisos de votación.

-- ============================================================
-- 1) Columnas para revisión de votos
-- ============================================================
alter table public.votes
  add column if not exists review_status text,
  add column if not exists review_comment text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- Votos históricos: se consideran aprobados.
update public.votes
set review_status = 'approved'
where review_status is null
   or trim(review_status) = '';

alter table public.votes
  alter column review_status set default 'approved';

alter table public.votes
  alter column review_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'votes_review_status_check'
      and conrelid = 'public.votes'::regclass
  ) then
    alter table public.votes
      add constraint votes_review_status_check
      check (review_status in ('approved','pending','rejected'));
  end if;
end $$;

-- ============================================================
-- 2) Admin puede aprobar/rechazar votos dudosos
-- ============================================================
drop policy if exists "votes_admin_update" on public.votes;
create policy "votes_admin_update"
on public.votes
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================================
-- 3) Detección de voto dudoso en base de datos
-- Nueva escala: 2,4,6,8,10.
-- Más de 4 puntos contra el promedio (con 2+ pares) => pending.
-- Todo 2 o todo 10 => pending.
-- ============================================================
create or replace function public.enforce_vote_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  peer_count integer := 0;
  avg_collaboration numeric;
  avg_cleaning numeric;
  avg_behavior numeric;
  avg_attitude numeric;
  suspicious boolean := false;
  caller_is_admin boolean := false;
begin
  caller_is_admin := public.is_admin();

  -- Si el Admin está revisando un voto ajeno, respetar su decisión.
  if caller_is_admin and auth.uid() is distinct from new.voter_id then
    return new;
  end if;

  select
    count(*),
    avg(collaboration),
    avg(cleaning),
    avg(behavior),
    avg(attitude)
  into
    peer_count,
    avg_collaboration,
    avg_cleaning,
    avg_behavior,
    avg_attitude
  from public.votes
  where event_id = new.event_id
    and target_id = new.target_id
    and voter_id <> new.voter_id
    and coalesce(review_status, 'approved') <> 'rejected';

  if peer_count >= 2 then
    if abs(new.collaboration - avg_collaboration) > 4
       or abs(new.cleaning - avg_cleaning) > 4
       or abs(new.behavior - avg_behavior) > 4
       or abs(new.attitude - avg_attitude) > 4 then
      suspicious := true;
    end if;
  end if;

  -- Patrón extremo con la escala descriptiva nueva.
  if (
    new.collaboration = 2 and new.cleaning = 2 and new.behavior = 2 and new.attitude = 2
  ) or (
    new.collaboration = 10 and new.cleaning = 10 and new.behavior = 10 and new.attitude = 10
  ) then
    suspicious := true;
  end if;

  if suspicious then
    if coalesce(length(trim(new.review_comment)), 0) = 0 then
      raise exception 'Este voto es dudoso y requiere una explicación.';
    end if;

    new.review_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    new.review_status := 'approved';
    new.review_comment := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_vote_review on public.votes;
create trigger trg_enforce_vote_review
before insert or update of
  collaboration,
  cleaning,
  behavior,
  attitude,
  review_comment
on public.votes
for each row
execute function public.enforce_vote_review();

-- ============================================================
-- 4) Solo asistentes PRESENTES pueden votar a PRESENTES
-- ============================================================
drop policy if exists "votes_own_insert" on public.votes;
create policy "votes_own_insert"
on public.votes
for insert
to authenticated
with check (
  voter_id = auth.uid()
  and voter_id <> target_id
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.is_closed = true
      and e.closed_at is not null
      and now() <= e.closed_at + interval '48 hours'
  )
  and exists (
    select 1
    from public.attendance a
    where a.event_id = event_id
      and a.profile_id = auth.uid()
      and a.status = 'present'
  )
  and exists (
    select 1
    from public.attendance a
    where a.event_id = event_id
      and a.profile_id = target_id
      and a.status = 'present'
  )
);

drop policy if exists "votes_own_update" on public.votes;
create policy "votes_own_update"
on public.votes
for update
to authenticated
using (voter_id = auth.uid())
with check (
  voter_id = auth.uid()
  and voter_id <> target_id
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.is_closed = true
      and e.closed_at is not null
      and now() <= e.closed_at + interval '48 hours'
  )
  and exists (
    select 1
    from public.attendance a
    where a.event_id = event_id
      and a.profile_id = auth.uid()
      and a.status = 'present'
  )
  and exists (
    select 1
    from public.attendance a
    where a.event_id = event_id
      and a.profile_id = target_id
      and a.status = 'present'
  )
);

-- ============================================================
-- 5) Verificación final
-- ============================================================
select review_status, count(*) as cantidad_votos
from public.votes
group by review_status
order by review_status;


-- ============================================================
-- v9.7 — Sanciones directas al promedio
-- ============================================================
-- La lógica vieja exigía penalty < 0 para una ausencia injustificada.
-- Esa restricción ya no corresponde porque ahora la sanción se calcula
-- directamente sobre el promedio de ranking.

alter table public.attendance
  drop constraint if exists unjustified_penalty_required;

-- attendance.penalty queda neutralizado para evitar doble castigo.
update public.attendance
set penalty = 0
where penalty <> 0;

alter table public.attendance
  alter column penalty set default 0;

-- Reglas vigentes:
-- No completar todos los votos dentro de 48 h: -1.0 al promedio de ranking.
-- Ausencia no justificable: -0.7 al promedio de ranking.
-- Ausencia justificable: sin descuento directo.
-- Estas sanciones se calculan dinámicamente en la app.
