-- Ejecutar UNA vez en Supabase > SQL Editor sobre el proyecto ya creado.
-- Cambia la edición de perfiles para que sea exclusiva del Admin.

drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;

create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
