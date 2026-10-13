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


## v5.1 — Calendario al editar juntadas

Se aplicó el mismo selector visual de calendario usado al crear una juntada también al formulario de edición.

Reemplazá solamente:

```text
app/page.tsx
```

No hace falta SQL nuevo.

Después:

```bash
npm.cmd run dev
```

Si funciona bien:

```bash
git add .
git commit -m "Corregir calendario al editar juntadas"
git push
```


## v6 — Pendientes de votación + reglas Bonus/Malus + terminología

- Inicio del Ranking: lista por juntada con quienes todavía deben completar votos, progreso y vencimiento.
- Reglas: explicación detallada de cómo se aplican y acumulan Bonus/Malus.
- Texto visible: `Justificada / Sin justificar` pasa a `Justificable / No justificable`.
- La lógica interna no cambia: Justificable no penaliza; No justificable resta 10 puntos.
- No requiere SQL nuevo.


## v6.1 — Timer de cierre de votaciones

En el inicio del Ranking se agregó **⏳ Cierre de votaciones**.

Por cada juntada que tenga la votación abierta muestra:

- nombre de la juntada;
- contador en vivo;
- días, horas, minutos y segundos restantes;
- fecha/hora exacta de cierre.

Ejemplo:

```text
🍖 Asado en lo de Pagis.tv
Cierra en
2 días · 04:18:36
```

Cuando el contador llega a cero, la juntada deja de aparecer entre las votaciones abiertas y las reglas existentes bloquean nuevos votos.

No hace falta SQL nuevo.

Reemplazá:

```text
app/page.tsx
app/globals.css
README.md
```


## v7 — Control fuerte de votos dudosos

### Niveles

- 🟢 **Normal**: entra directo al cálculo.
- 🟡 **Atípico**: más de 3 puntos de diferencia respecto del promedio del resto. Se guarda y queda visible para control.
- 🔴 **Dudoso**:
  - más de 4 puntos de diferencia respecto del promedio del resto, con al menos 2 votos comparables; o
  - patrón extremo `1/1/1/1` o `10/10/10/10`.

Un voto dudoso:
1. exige explicación obligatoria;
2. queda `pending`;
3. no computa en el ranking;
4. el Admin puede aprobarlo o rechazarlo.

### Estados
- `approved`: computa.
- `pending`: no computa.
- `rejected`: queda registrado pero no computa.

### Importante: SQL obligatorio

En Supabase → SQL Editor ejecutá:

```text
supabase/update_v7.sql
```

Este parche:
- agrega campos de revisión a `votes`;
- permite al Admin aprobar/rechazar;
- agrega un trigger para que un usuario no pueda saltearse la regla desde el navegador.

### Actualización

Reemplazá:

```text
app/page.tsx
app/globals.css
README.md
```

y guardá:

```text
supabase/update_v7.sql
```

Después:

```bash
npm.cmd run dev
```

Si funciona:

```bash
git add .
git commit -m "Control de votos dudosos con aprobacion admin"
git push
```


## v8 — Ranking competitivo por promedio

El ranking principal deja de sumar puntajes completos por juntada.

### Nueva fórmula

```text
Puntaje final =
85% × Rendimiento promedio
+ 15% × % Asistencia
+ Ajustes normalizados
```

### Rendimiento promedio

Se promedian únicamente las juntadas donde el jugador recibió votos válidos.

Una ausencia **no agrega un 0** al promedio de rendimiento.

### Asistencia

El porcentaje de asistencia pesa 15% en el ranking principal.

Por ejemplo:
- 100% de asistencia aporta 15 puntos.
- 80% aporta 12 puntos.
- 60% aporta 9 puntos.

### Bonus/Malus y sanciones

Primero se acumulan:

```text
Bonus/Malus
+ penalizaciones por faltas no justificables
+ penalizaciones por no votar en 72 h
```

Luego:

```text
Ajuste normalizado =
Ajustes acumulados / cantidad de juntadas computadas
```

Ejemplo:

```text
+5 Bonus
-10 falta no justificable
5 juntadas computadas

(-5) / 5 = -1
```

Ese `-1` se aplica al puntaje final.

### Resultado

El ranking queda en escala `0–100`, haciendo que faltar una juntada perjudique por asistencia y sanciones cuando corresponda, pero sin dejar al jugador fuera de competencia por perder una fecha.

No hace falta ejecutar SQL nuevo.

Reemplazá:

```text
app/page.tsx
app/globals.css
README.md
```

Probá:

```bash
npm.cmd run dev
```

Si funciona:

```bash
git add .
git commit -m "Ranking promedio competitivo"
git push
```


## v8.1 — Solo votan quienes estuvieron presentes

Ahora la restricción se aplica en dos niveles:

### Interfaz
- Si el usuario faltó, ve un aviso indicando que no puede votar esa juntada.
- Todas las tarjetas de votación quedan bloqueadas.
- Tampoco puede votar a una persona que haya faltado.

### Supabase
Ejecutar:

```text
supabase/update_v8_1.sql
```

Esto refuerza las políticas RLS para impedir que el control pueda saltearse desde el navegador.

### Regla final
Para guardar un voto:
- el votante debe estar `present`;
- la persona votada debe estar `present`;
- no puede votarse a sí mismo;
- la juntada debe estar cerrada;
- deben seguir vigentes las 72 horas de votación.
