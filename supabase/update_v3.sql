-- Liga de Juntadas v3
-- Ejecutar UNA sola vez en Supabase > SQL Editor.
-- Agrega cierre de juntada + plazo de 48 horas y endurece las reglas de votación.

alter table public.events
add column if not exists closed_at timestamptz;

-- Mantener is_closed sincronizado con closed_at para las nuevas operaciones.
update public.events
set closed_at = null
where is_closed = false;

-- Las políticas anteriores de votos se reemplazan por reglas que:
-- 1) permiten votar solo al propio usuario;
-- 2) impiden auto-voto;
-- 3) exigen que votante y votado hayan asistido;
-- 4) permiten votar solo cuando la juntada está cerrada;
-- 5) bloquean votos luego de 48 horas.

drop policy if exists "votes_own_insert" on public.votes;
drop policy if exists "votes_own_update" on public.votes;

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
    where e.id = votes.event_id
      and e.is_closed = true
      and e.closed_at is not null
      and now() <= e.closed_at + interval '48 hours'
  )
  and exists (
    select 1
    from public.attendance av
    where av.event_id = votes.event_id
      and av.profile_id = votes.voter_id
      and av.status = 'present'
  )
  and exists (
    select 1
    from public.attendance at
    where at.event_id = votes.event_id
      and at.profile_id = votes.target_id
      and at.status = 'present'
  )
);

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
    where e.id = votes.event_id
      and e.is_closed = true
      and e.closed_at is not null
      and now() <= e.closed_at + interval '48 hours'
  )
  and exists (
    select 1
    from public.attendance av
    where av.event_id = votes.event_id
      and av.profile_id = votes.voter_id
      and av.status = 'present'
  )
  and exists (
    select 1
    from public.attendance at
    where at.event_id = votes.event_id
      and at.profile_id = votes.target_id
      and at.status = 'present'
  )
);

-- Una vez cerrada una juntada, un usuario común nunca puede modificarla.
-- La política existente ya limita events al Admin.
-- Attendance también sigue siendo exclusiva del Admin.

-- Nota:
-- La penalización de -5 por no completar todos los votos se calcula
-- automáticamente en la app cuando ya vencieron las 48 horas.
-- No requiere cron ni tareas pagas.
