-- Liga de Juntadas v5
-- Ejecutar UNA sola vez en Supabase > SQL Editor.
-- Esta versión usa las políticas Admin ya existentes para editar/eliminar juntadas.
-- Solo reforzamos que las relaciones hijas estén configuradas con ON DELETE CASCADE.

-- Verificación informativa:
-- attendance.event_id, votes.event_id y point_adjustments.event_id
-- ya fueron creadas con ON DELETE CASCADE en el schema original.
-- Por lo tanto, al borrar una juntada también se borran automáticamente
-- asistencias, votos y bonus/malus vinculados.

-- No se necesita cambiar ninguna policy si ya ejecutaste schema.sql + update_v2 + update_v3.
-- El Admin ya tiene permiso de UPDATE y DELETE sobre public.events.
--
-- Este archivo queda como parche/versionado para dejar documentado el cambio.
select 'v5 lista: edición/eliminación de juntadas usa las políticas Admin existentes' as status;
