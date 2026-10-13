-- Liga de Juntadas v8.1
-- Ejecutar en Supabase > SQL Editor.
-- Refuerza que solo asistentes presentes puedan votar a otros asistentes presentes.

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

select 'v8.1 lista: votación restringida a asistentes presentes' as status;
