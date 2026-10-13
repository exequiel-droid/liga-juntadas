-- Liga de Juntadas v8.4
-- Reparación de votos históricos.
-- Ejecutar en Supabase > SQL Editor.

alter table public.votes
  add column if not exists review_status text,
  add column if not exists review_comment text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- Todos los votos creados antes del sistema de revisión se consideran aprobados.
update public.votes
set review_status = 'approved'
where review_status is null
   or trim(review_status) = '';

-- Dejar aprobado como valor por defecto para nuevos registros si el trigger no lo cambia.
alter table public.votes
  alter column review_status set default 'approved';

-- Asegurar que no queden nulos.
alter table public.votes
  alter column review_status set not null;

-- Constraint de estados válidos, solo si todavía no existe.
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

select
  review_status,
  count(*) as cantidad_votos
from public.votes
group by review_status
order by review_status;
