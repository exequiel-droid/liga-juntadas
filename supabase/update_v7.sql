-- Liga de Juntadas v7
-- Ejecutar UNA sola vez en Supabase > SQL Editor.
-- Agrega revisión de votos dudosos y protección en base de datos.

alter table public.votes
  add column if not exists review_status text not null default 'approved',
  add column if not exists review_comment text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

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

-- Los votos ya existentes quedan aprobados.
update public.votes
set review_status = 'approved'
where review_status is null;

-- Admin puede revisar votos ajenos.
drop policy if exists "votes_admin_update" on public.votes;
create policy "votes_admin_update"
on public.votes
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Calcula si un voto es dudoso y fuerza estado pending.
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

  -- Si el Admin está revisando un voto de otra persona, respetar su decisión.
  if caller_is_admin and auth.uid() is distinct from new.voter_id then
    return new;
  end if;

  -- Un usuario normal no decide su estado de revisión.
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
    and review_status <> 'rejected';

  if peer_count >= 2 then
    if abs(new.collaboration - avg_collaboration) > 4
       or abs(new.cleaning - avg_cleaning) > 4
       or abs(new.behavior - avg_behavior) > 4
       or abs(new.attitude - avg_attitude) > 4 then
      suspicious := true;
    end if;
  end if;

  -- Patrón extremo.
  if (
    new.collaboration = 1 and new.cleaning = 1 and new.behavior = 1 and new.attitude = 1
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

select 'v7 lista: control de votos dudosos activo' as status;
