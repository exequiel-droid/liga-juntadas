# 🏆 Liga de Juntadas — Web App

Versión web para usar desde PC o celular.

## Qué incluye

- Login / registro con Supabase Auth.
- Rol `admin` y rol `user`.
- Ranking general.
- Ranking de asistencias e inasistencias.
- El que más falta queda marcado para pagar el escabio 🍻.
- Usuarios puntúan:
  - 🛒 Colaboración
  - 🧹 Limpieza
  - 🤝 Comportamiento
  - 🎉 Actitud
- Nadie puede votarse a sí mismo.
- Solo Admin puede:
  - Crear juntadas.
  - Marcar asistencia.
  - Elegir falta justificada / no justificada.
  - Cargar motivo de inasistencia.
  - Crear Bonus/Malus y su descripción.
- Falta no justificada: `-10 pts` automática.
- Perfiles editables por cada usuario.
- Diseño responsive para celular.

## 1. Crear Supabase

1. Entrá a https://supabase.com y creá un proyecto gratuito.
2. Abrí `SQL Editor`.
3. Copiá TODO el contenido de `supabase/schema.sql` y ejecutalo.
4. En Supabase > Project Settings / Connect buscá:
   - Project URL
   - Publishable key

## 2. Configurar la app

Copiá `.env.example` como `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx
```

## 3. Ejecutar localmente

Necesitás Node.js instalado.

```bash
npm install
npm run dev
```

Abrí:

```text
http://localhost:3000
```

## 4. Convertirte en Admin

Primero creá tu cuenta desde la web.

Después, en Supabase > SQL Editor:

```sql
update public.profiles
set role = 'admin',
    name = 'Exe',
    emoji = '🧠',
    title = 'El Data Lord'
where id = (
  select id
  from auth.users
  where email = 'TU_EMAIL'
);
```

Reemplazá `TU_EMAIL` por el email con el que te registraste.

## 5. Publicarla gratis en Vercel

1. Subí esta carpeta a un repositorio de GitHub.
2. Entrá a Vercel.
3. `Add New Project`.
4. Importá el repositorio.
5. En Environment Variables agregá:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
6. Deploy.

Vercel genera una URL parecida a:

```text
liga-juntadas.vercel.app
```

Desde ahí todos pueden entrar desde el celular.

## Seguridad

No depende de esconder botones.

Las tablas usan Row Level Security (RLS):
- usuarios comunes **no pueden** modificar `attendance`;
- usuarios comunes **no pueden** agregar `point_adjustments`;
- cada usuario solo puede crear/editar votos cuyo `voter_id` sea su propio usuario;
- el Admin sí puede administrar asistencia y Bonus/Malus.

Además, la base tiene un `CHECK` que obliga a que una falta `unjustified` tenga una penalización negativa.

## Próximas mejoras recomendadas

- Invitaciones privadas en vez de registro abierto.
- Cerrar una fecha para impedir cambios posteriores.
- Votación anónima.
- MVP automático por juntada.
- Premios de temporada.
- Fotos de perfil.
- Temporadas 2026 / 2027 / histórico.

## Actualización v2

Cambios incluidos:
- Botón 👁️ para mostrar/ocultar la contraseña.
- Botón 📅 para abrir el selector de fecha, especialmente útil desde celular.
- Los perfiles pasan a ser editables únicamente por el Admin.
- Nueva pestaña `Reglas`.
- Pesos del puntaje: Colaboración 30%, Limpieza 30%, Comportamiento 20%, Actitud 20%.
- Falta sin justificar: -10 puntos obligatorios.

### Si ya habías creado la base antes de esta versión

No vuelvas a ejecutar todo `schema.sql`. Ejecutá únicamente:

`supabase/update_v2.sql`

Eso reemplaza la política de perfiles para que solo el Admin pueda modificarlos.
