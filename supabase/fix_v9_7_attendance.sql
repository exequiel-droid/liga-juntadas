-- Reparación rápida v9.7
-- Ejecutar en Supabase > SQL Editor si update_v9.sql falló por:
-- unjustified_penalty_required

alter table public.attendance
  drop constraint if exists unjustified_penalty_required;

update public.attendance
set penalty = 0
where penalty <> 0;

alter table public.attendance
  alter column penalty set default 0;

select status, penalty, count(*) as cantidad
from public.attendance
group by status, penalty
order by status, penalty;
