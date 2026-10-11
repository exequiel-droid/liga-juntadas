# 🏆 Liga de Juntadas — Web App v3

Esta versión suma control de votos, cierre de juntadas y penalización automática por no votar a tiempo.

## Cambios v3

- ✂️ Promedio recortado:
  - con 5 o más votos recibidos, se elimina el voto más alto y el más bajo de **cada categoría**;
  - con menos de 5 votos, se usa el promedio normal.
- ⚠️ Detección de votos atípicos:
  - si una nota queda a más de 3 puntos del promedio de los demás votantes, aparece en el Panel Admin;
  - no se elimina automáticamente.
- 🔎 El Admin puede ver el detalle completo de quién votó a quién y los valores por categoría.
- 🔒 El Admin cierra la juntada.
- ⏰ Desde el cierre corren 72 horas para votar.
- Cada asistente debe votar a todos los demás asistentes.
- ⛔ Después de las 72 horas ya no se pueden crear ni modificar votos.
- −5 pts automáticos si un asistente no completó todos sus votos dentro del plazo.
- 📜 Reglas actualizadas con toda esta lógica.

## Importante: actualización de Supabase

Si ya tenés la app v2 funcionando, **NO vuelvas a ejecutar `schema.sql`**.

Ejecutá únicamente:

```text
supabase/update_v3.sql
```

en Supabase → SQL Editor → New query → Run.

Esto agrega `closed_at` a las juntadas y actualiza las políticas RLS de `votes`.

## Cómo actualizar tu proyecto actual

Copiá desde esta carpeta sobre tu proyecto existente:

- `app/page.tsx`
- `app/globals.css`
- `supabase/update_v3.sql`
- `README.md`

No reemplaces `.env.local`.

Después probá:

```bash
npm.cmd run dev
```

Si funciona:

```bash
git add .
git commit -m "Control de votos y plazo de 72 horas"
git push
```

Vercel debería desplegar automáticamente.

## Puntaje

- 🛒 Colaboración: 30%
- 🧹 Limpieza: 30%
- 🤝 Comportamiento: 20%
- 🎉 Actitud: 20%

Sanciones:
- 🔴 falta sin justificar: −10 pts.
- ⏰ votación incompleta al vencer 72 h: −5 pts por juntada.
- ⚡ Bonus/Malus: solo Admin.

## Cómo funciona la penalización de 72 horas

La penalización se calcula dinámicamente al cargar la app:

1. la juntada debe estar cerrada;
2. deben haber pasado 72 horas;
3. el jugador debe haber asistido;
4. se cuentan todos los demás asistentes que debía puntuar;
5. si falta al menos un voto, se aplican −5 puntos una sola vez para esa fecha.

No hace falta ningún cron, servidor pago ni automatización externa.


## v4 — Registro sin confirmación por email

La app sigue usando **email + contraseña**, pero está preparada para trabajar sin confirmación por correo.

### Paso obligatorio en Supabase

En tu proyecto:

1. `Authentication`
2. `Providers`
3. `Email`
4. Desactivá **Confirm email** / **Email confirmations**
5. Guardá los cambios.

Con eso:
- el usuario se registra con email y contraseña;
- Supabase crea la sesión directamente;
- no se envía correo de confirmación;
- evitás rebotes de emails por cuentas de prueba o direcciones mal escritas.

### Importante

No hace falta ejecutar SQL nuevo para esta v4.

Solo reemplazá:

```text
app/page.tsx
README.md
```

y después:

```bash
npm.cmd run dev
```

Si todo funciona:

```bash
git add .
git commit -m "Registro sin confirmacion por email"
git push
```


## v5 — Editar y eliminar juntadas

El Admin ahora puede administrar fechas existentes desde la pestaña **Admin**:

- ✏️ Editar:
  - nombre;
  - fecha;
  - anfitrión.
- 🗑️ Eliminar:
  - pide confirmación;
  - luego exige escribir `ELIMINAR`;
  - borra también asistencias, votos y Bonus/Malus vinculados gracias a `ON DELETE CASCADE`.

### Restricción

Una juntada cerrada no se puede editar desde la interfaz. Esto evita cambiar fecha/anfitrión después de comenzar el plazo de votación.

### SQL

No hay cambios estructurales obligatorios si ya ejecutaste:
- `schema.sql`
- `update_v2.sql`
- `update_v3.sql`

Incluí `supabase/update_v5.sql` solo como verificación/versionado.

### Actualizar

Reemplazá:

```text
app/page.tsx
app/globals.css
README.md
```

Opcionalmente guardá también:

```text
supabase/update_v5.sql
```

Después:

```bash
npm.cmd run dev
```

Y si está bien:

```bash
git add .
git commit -m "Editar y eliminar juntadas"
git push
```
