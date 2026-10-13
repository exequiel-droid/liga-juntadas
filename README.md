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
- ⏰ Desde el cierre corren 48 horas para votar.
- Cada asistente debe votar a todos los demás asistentes.
- ⛔ Después de las 48 horas ya no se pueden crear ni modificar votos.
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
git commit -m "Control de votos y plazo de 48 horas"
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
- ⏰ votación incompleta al vencer 48 h: −5 pts por juntada.
- ⚡ Bonus/Malus: solo Admin.

## Cómo funciona la penalización de 48 horas

La penalización se calcula dinámicamente al cargar la app:

1. la juntada debe estar cerrada;
2. deben haber pasado 48 horas;
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
+ penalizaciones por no votar en 48 h
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
- deben seguir vigentes las 48 horas de votación.


## v8.2 — Ranking ordenado por promedio general

El criterio principal del ranking ahora es:

```text
Promedio general de rendimiento
```

Se ordena de mayor a menor.

### Desempates

Si dos jugadores tienen exactamente el mismo promedio:

1. mayor porcentaje de asistencia;
2. mayor puntaje ajustado.

### Qué pasa con los puntos

El puntaje ajustado `0–100` sigue calculándose y se muestra como información adicional.

Incluye el efecto de:
- asistencia;
- Bonus/Malus;
- faltas no justificables;
- penalizaciones por no completar la votación.

Pero **ya no define la posición principal**.

### Visual

Cada fila muestra como número destacado:

```text
8.7
PROM.
```

Y debajo se siguen mostrando:
- asistencia;
- cantidad de juntadas puntuadas;
- puntos ajustados;
- Bonus/Malus;
- sanciones.

No hace falta SQL nuevo.


## v8.3 — Corrección de build en Vercel

Se corrigió un error de inferencia de TypeScript en la clasificación de votos `normal / atypical / suspicious` que hacía fallar `npm run build` en Vercel.

Esta versión conserva todo lo incluido hasta v8.2:
- revisión Admin de votos dudosos;
- timers de votación;
- pendientes de voto;
- solo asistentes presentes pueden votar;
- ranking ordenado por promedio general;
- puntos como dato secundario.

No requiere SQL adicional si ya ejecutaste `update_v7.sql` y `update_v8_1.sql`.


## v8.4 — Corrección de promedios en 0

El problema era que el ranking filtraba exclusivamente:

```text
review_status = approved
```

Los votos históricos creados antes de v7 podían no tener ese campo informado, por lo que quedaban fuera del cálculo.

### Corrección

Ahora:
- `approved` computa;
- `null` / votos históricos sin estado también computan como aprobados;
- `pending` no computa;
- `rejected` no computa.

### SQL recomendado

Ejecutar:

```text
supabase/update_v8_4.sql
```

Este script:
- crea los campos de revisión si faltan;
- marca como `approved` todos los votos históricos sin estado;
- deja `approved` como default;
- muestra al final un conteo por estado para verificar.

Después del SQL, deberías obtener algo parecido a:

```text
approved | 45
pending  | 2
rejected | 1
```

Los números dependen de tus votos reales.

### Actualización

Reemplazá:

```text
app/page.tsx
README.md
```

y agregá:

```text
supabase/update_v8_4.sql
```

Antes de subir:

```bash
npm.cmd run build
```

Luego:

```bash
git add .
git commit -m "Corregir promedios de votos historicos"
git push
```


## v9 — Votación descriptiva de 5 niveles + reparación histórica

La votación deja de usar el selector numérico 1–10.

### Nueva escala

| Opción | Valor interno |
|---|---:|
| 😡 Muy mala | 2 |
| 😕 Mala | 4 |
| 😐 Regular | 6 |
| 🙂 Buena | 8 |
| 🤩 Excelente | 10 |

El usuario solo ve y elige las descripciones. Los números quedan por debajo para conservar los cálculos existentes.

### Votos históricos

Los votos viejos que tengan valores 1–10 continúan funcionando. Al mostrarlos se usa la descripción más cercana, pero su valor original no se modifica.

Además esta versión incluye la corrección de `review_status` de v8.4.

### Voto guardado

Después de guardar se muestra un resumen con las cuatro categorías, por ejemplo:

```text
🛒 Colaboración     🙂 Buena
🧹 Limpieza         🤩 Excelente
🤝 Comportamiento  😐 Regular
🎉 Actitud          🙂 Buena
```

El Admin también ve estas descripciones en el detalle y en la cola de votos dudosos.

### SQL

Como todavía no subiste v8.4, ejecutá directamente:

```text
supabase/update_v9.sql
```

Este SQL está consolidado e incluye:
- reparación de votos históricos;
- estados `approved / pending / rejected`;
- detección de votos dudosos;
- patrón extremo adaptado a la nueva escala `2–10`;
- restricción para que solo asistentes presentes voten a asistentes presentes.

No hace falta ejecutar `update_v8_4.sql` por separado.

### Antes de publicar

```bash
npm.cmd run build
```

Luego:

```bash
git add .
git commit -m "Votacion descriptiva de cinco niveles"
git push
```


## v9.1 — Reglamento completo dentro de la app

La pestaña **Reglas** ahora documenta todo el sistema vigente:

- escala de 5 niveles;
- pesos de categorías;
- promedio general;
- orden del ranking;
- puntos ajustados;
- asistencia;
- Justificable / No justificable;
- penalización −10;
- quiénes pueden votar;
- ventana de 48 horas;
- timer de cierre;
- votaciones pendientes;
- penalización −5 por votación incompleta;
- votos atípicos;
- votos dudosos;
- aprobación/rechazo del Admin;
- promedio recortado;
- Bonus/Malus;
- votos históricos;
- cierre de juntadas.

Esta versión incluye todos los cambios de v9. No necesitás subir v9 antes.

### SQL

Si todavía no ejecutaste la migración anterior, ejecutá directamente:

```text
supabase/update_v9.sql
```

No hay un SQL nuevo específico para v9.1.

### Publicación

Reemplazá:

```text
app/page.tsx
app/globals.css
README.md
```

Conservá:

```text
supabase/update_v9.sql
```

Probá:

```bash
npm.cmd run build
```

Y luego:

```bash
git add .
git commit -m "Reglamento completo y votacion descriptiva"
git push
```


## v9.2 — Editar votos mientras la votación está abierta

Los votos guardados ahora tienen un flujo explícito de edición.

### Funcionamiento

- Si todavía no votaste a una persona, aparece el formulario normal.
- Si ya votaste, se muestra **Tu voto guardado** con las cuatro categorías.
- Mientras no hayan vencido las 48 horas aparece **✏️ Editar voto**.
- Al editar podés cambiar cualquiera de las categorías.
- Podés **Guardar cambios** o **Cancelar**.
- Al vencer las 48 horas el voto queda solo de lectura y ya no se puede modificar.

### Base de datos

No hay SQL nuevo para v9.2.

El archivo consolidado:

```text
supabase/update_v9.sql
```

ya permite `UPDATE` de votos propios mientras el evento esté cerrado, el usuario haya estado presente y siga abierta la ventana de 48 horas.

Esta versión incluye todos los cambios de v9.1.


## v9.3 — Ajuste de descripción de Limpieza

Se cambió:

```text
Limpieza
Orden, lavado y ayuda al final
```

por:

```text
Limpieza
Orden, cuidado del espacio y limpieza durante la juntada
```

Además, la descripción de cada categoría queda visualmente separada del nombre con un espacio/margen para mejorar la lectura.

No requiere SQL nuevo.


## v9.4 — Ranking oculto hasta completar votos

- El Admin siempre puede ver el ranking.
- Un usuario presente con votos pendientes no ve promedios ni puntajes actualizados.
- La pantalla bloqueada indica en qué juntadas debe votar y cuántos votos le faltan.
- Al completar todos sus votos obligatorios, el ranking se desbloquea automáticamente.
- Una ausencia no genera obligación de votar ni bloqueo.
- Cuando vence la ventana de votación, esa fecha deja de bloquear visualmente el ranking y se aplican las penalizaciones existentes cuando corresponda.

No requiere SQL nuevo. Se sigue usando `supabase/update_v9.sql`.


## v9.5 — Ventana de votación de 48 horas

El plazo de votación baja de **72 horas a 48 horas**.

El cambio aplica en todos los lugares del sistema:

- timer de cierre;
- permisos para crear votos;
- permisos para editar votos;
- bloqueo del ranking mientras haya votos pendientes;
- penalización por votación incompleta;
- reglas visibles dentro de la app;
- mensajes al usuario;
- políticas RLS de Supabase.

### SQL

Como cambia el plazo que valida Supabase, ejecutá nuevamente:

```text
supabase/update_v9.sql
```

El archivo ya fue actualizado para usar:

```sql
interval '48 hours'
```

No hace falta ejecutar migraciones viejas por separado.


## v9.6 — Sanciones directas al promedio

Se revisaron las dos reglas para que tengan impacto real en el ranking:

- No completar todos los votos dentro de 48 horas: **−0,5 al promedio de ranking por juntada incumplida**.
- Ausencia no justificable: **−0,3 al promedio de ranking por ausencia**.
- Ausencia justificable: **sin descuento directo al promedio**.

Ejemplo:

```text
Promedio bruto:                  8,7
1 votación incompleta           -0,5
1 ausencia no justificable      -0,3
Promedio de ranking:             7,9
```

La tabla se ordena por **promedio de ranking**, no por el promedio bruto.

Bonus/Malus quedan como dato adicional y no modifican este promedio.

### SQL

Volvé a ejecutar:

```text
supabase/update_v9.sql
```

Esto limpia penalizaciones históricas guardadas en `attendance.penalty` para evitar dobles castigos.

### Publicación

Reemplazá:

```text
app/page.tsx
README.md
supabase/update_v9.sql
```

Antes de subir:

```bash
npm.cmd run build
```

Luego:

```bash
git add .
git commit -m "Aplicar sanciones directas al promedio"
git push
```


## v9.7 — Corrección de constraint de ausencias

La base todavía tenía el constraint antiguo:

```text
unjustified_penalty_required
```

que obligaba a guardar un `penalty` negativo cuando la ausencia era `unjustified`.

La lógica actual ya no usa esa columna para sancionar. Ahora:

- no votar en 48 h: `−0,5` directo al promedio de ranking;
- ausencia no justificable: `−0,3` directo al promedio de ranking;
- `attendance.penalty` queda en `0`.

### SQL

Podés ejecutar directamente:

```text
supabase/fix_v9_7_attendance.sql
```

y después volver a ejecutar:

```text
supabase/update_v9.sql
```

El `update_v9.sql` de esta versión ya incluye el arreglo.

### Frontend

También se corrigió una referencia vieja a `UNJUSTIFIED_PENALTY` que podía romper el build.

### Publicación

Reemplazá:

```text
app/page.tsx
README.md
supabase/update_v9.sql
```

y agregá:

```text
supabase/fix_v9_7_attendance.sql
```

Después:

```bash
npm.cmd run build
```

Y si compila:

```bash
git add .
git commit -m "Corregir sanciones de asistencia"
git push
```


## v9.8 — Corrección de build TypeScript

Se corrigieron referencias antiguas que quedaron después de migrar las sanciones al promedio:

- `UNJUSTIFIED_PENALTY` → `UNJUSTIFIED_AVG_PENALTY`
- `MISSED_VOTING_PENALTY` → `MISSED_VOTING_AVG_PENALTY`
- `total` → `rankingAverage`
- `attendancePenalty` → `unjustifiedAbsenceAvgPenalty`
- `deadlinePenalty` → `missedVotingAvgPenalty`

La lógica vigente queda:

- No votar dentro de 48 h: `−0,5` al promedio de ranking.
- Ausencia no justificable: `−0,3` al promedio de ranking.
- Ausencia justificable: sin penalización directa.
- El ranking se ordena por `rankingAverage`.

### SQL

No hay un SQL adicional para esta corrección de TypeScript.

Si todavía no ejecutaste la reparación de asistencia:

```text
supabase/fix_v9_7_attendance.sql
```

y luego:

```text
supabase/update_v9.sql
```

### Publicación

Reemplazá:

```text
app/page.tsx
README.md
```

Antes de hacer push:

```bash
npm.cmd run build
```

Si compila:

```bash
git add .
git commit -m "Corregir build de sanciones y ranking"
git push
```


## v9.9 — Corrección puntual del ranking de asistencia

Se corrigió una referencia que había quedado mal por un reemplazo global:

```text
r.rankingAverage
```

se estaba usando dentro del ranking de asistencia, cuyo objeto utiliza:

```text
r.total
```

No cambia ninguna regla ni cálculo del ranking principal.

### Publicación

Reemplazá:

```text
app/page.tsx
README.md
```

Después:

```bash
npm.cmd run build
```

Si compila:

```bash
git add .
git commit -m "Corregir build ranking asistencia"
git push
```


## v10 — Penalizaciones severas + explicación de métricas

### Penalizaciones

- No completar todos los votos dentro de 48 h: **−1,0 directo al promedio de ranking por juntada**.
- Ausencia no justificable: **−0,7 directo al promedio de ranking por ausencia**.
- Ausencia justificable: **sin penalización directa**.

Las penalizaciones son acumulativas y no se normalizan.

Ejemplo:

```text
Promedio general:                 8,6
1 votación incompleta            -1,0
1 ausencia no justificable       -0,7
Promedio de ranking:              6,9
```

### Qué significa cada métrica

**Promedio general**
- Es el promedio puro de rendimiento.
- Sale de Colaboración, Limpieza, Comportamiento y Actitud.
- No incluye sanciones.

**Promedio de ranking**
- Es el Promedio general menos las sanciones.
- Es el valor que ordena la tabla principal.

**Puntos ajustados**
- Son un dato adicional.
- Sirven para mostrar otros efectos como Bonus/Malus y ajustes.
- No determinan la posición principal.

### SQL

No hay cambios de estructura nuevos. El `update_v9.sql` de esta versión solo actualiza documentación/comentarios de las reglas.

### Publicación

Reemplazá:

```text
app/page.tsx
app/globals.css
README.md
supabase/update_v9.sql
```

Después:

```bash
npm.cmd run build
```

Y si compila:

```bash
git add .
git commit -m "Endurecer sanciones y explicar metricas"
git push
```


## v10.1 — Desglose de sanciones en la tabla del ranking

Cada jugador muestra directamente:

- Promedio general.
- Asistencia.
- Cantidad de juntadas puntuadas.
- 🗳️ Penalización por no votar y cantidad de incumplimientos.
- 🔴 Penalización por ausencias no justificables y cantidad.
- ⚡ Bonus/Malus como dato adicional.
- 🏆 Promedio de ranking final.

Ejemplo:

```text
Promedio general 8,6 · Asistencia 80% · 4 juntadas
🗳️ No votar −1,0 (1)
🔴 No justificables −0,7 (1)
⚡ Bonus/Malus +5
🏆 Promedio ranking: 8,6 −1,0 −0,7 = 6,9
```

El número destacado a la derecha ahora es el **Promedio de ranking**, que es el valor que realmente define la posición.

No requiere SQL adicional respecto de v10.
\n\n## v11 — Temporadas manuales e historial\n\n### Temporadas\n- El Admin crea temporadas manualmente con nombre y emoji.\n- Solo puede existir una temporada activa.\n- Para iniciar otra, primero se cierra la actual.\n- Las juntadas nuevas se asignan automáticamente a la temporada activa.\n- Ranking abre por defecto en la temporada actual, pero permite consultar temporadas anteriores.\n\n### Cierre e historial congelado\nAl cerrar una temporada se guarda un snapshot con la tabla final y premios. Cambios futuros de reglas no recalculan ese resultado histórico.\n\nPremios incluidos:\n- 🏆 Campeón\n- 👻 El Fantasma (más ausencias)\n- 🗳️ Democracia Cero (más incumplimientos de votación)\n- 🧼 Don Limpieza\n- 🛒 El Abastecedor\n- 🤝 Señor Convivencia\n- 🎉 Alma de la Juntada\n\n### Migración\nEjecutar `supabase/update_v11.sql`. Si ya existen juntadas, se asignan automáticamente a `🏁 Temporada inicial`.\n\n### Archivos\nReemplazar `app/page.tsx`, `app/globals.css`, `README.md` y agregar `supabase/update_v11.sql`.\n
### Escala del promedio
En v11 el promedio general queda expresado correctamente en escala **0 a 10** (por ejemplo 8,6). Esto hace que las sanciones acordadas tengan el peso esperado: −1,0 por no votar y −0,7 por falta no justificable.


## v11.1 — Ranking visible sobre 100 + corrección de Reglamento

### Escala

La lógica interna continúa trabajando con notas entre 0 y 10 para preservar compatibilidad con votos y temporadas existentes.

La interfaz del ranking ahora muestra esos valores sobre 100:

```text
8,15 interno -> 81.5 visible
```

Por lo tanto las sanciones se muestran como:

- No completar la votación en 48 horas: **−10.0**
- Falta no justificable: **−7.0**

Ejemplo:

```text
Promedio general:            81.5
No votar una juntada:       -10.0
Falta no justificable:       -7.0
Promedio de ranking:         64.5
```

El peso matemático es exactamente el mismo que antes; solo cambia la escala visible.

### Reglamento

Se corrigió el bloque de reglas que estaba mal anidado y provocaba que “Promedio general” apareciera en una columna extremadamente angosta.

También se eliminaron textos antiguos como:

```text
resta 10 puntos automáticamente
recibe -5 puntos
```

y se reemplazaron por las reglas vigentes.

### Publicación

Reemplazá:

```text
app/page.tsx
README.md
```

No requiere cambios nuevos de SQL ni CSS.

Antes del push:

```bash
npm.cmd run build
```


## v11.3 — Consolidación de ranking + historial Bonus/Malus

Esta versión corrige el build de v11.2 y consolida los cambios anteriores.

### Ranking visible sobre 100

La lógica interna continúa en 0–10, pero la interfaz muestra:

```text
8,15 -> 81.5
```

Sanciones:

```text
No votar en 48 h       -10.0
Falta no justificable   -7.0
```

### Registro Bonus/Malus

Ahora está dentro de la pestaña **Historial**, debajo del historial de temporadas.

Permite filtrar por:

- jugador;
- temporada.

Cada registro muestra:

- jugador;
- temporada;
- juntada;
- fecha;
- valor;
- descripción.

No utiliza `created_at`, porque la estructura actual de `point_adjustments` no lo expone en el frontend.

### Reglas

Se rehizo el componente de Reglas para eliminar JSX mal anidado y textos antiguos.

Queda explicado:

- Promedio general;
- Promedio de ranking;
- Bonus/Malus / puntos ajustados;
- penalización de -10.0 por no votar;
- penalización de -7.0 por falta no justificable;
- temporadas.

### Publicación

Reemplazá:

```text
app/page.tsx
app/globals.css
README.md
```

No requiere SQL nuevo respecto de v11.

Antes del push:

```bash
npm.cmd run build
```


## v11.4 — Historial completo también para la temporada en curso

La pestaña Historial ahora abre por defecto sobre la temporada activa y permite cambiar a cualquier temporada anterior.

Cada jugador muestra:

- posición;
- Promedio general;
- Promedio de ranking;
- asistencia;
- juntadas puntuadas;
- promedio final de Colaboración;
- promedio final de Limpieza;
- promedio final de Comportamiento;
- promedio final de Actitud;
- presentes;
- faltas justificables;
- faltas no justificables + penalización;
- incumplimientos de votación + penalización;
- Bonus/Malus acumulado;
- fórmula final del ranking.

Los promedios se muestran siempre sobre 100 con un decimal:

```text
81.7
74.2
99.9
100.0
```

La lógica interna sigue en 0–10 para preservar compatibilidad.

### Publicación

Reemplazá:

```text
app/page.tsx
app/globals.css
README.md
```

No requiere SQL nuevo.

Antes del push:

```bash
npm.cmd run build
```


## v11.5 — Corrección de build de Historial

Se corrigieron los errores TypeScript reportados por Vercel en v11.4:

- se agregaron los estados de selección de temporada e historial Bonus/Malus;
- los promedios por categoría usan `eventFinalScore().values`;
- las categorías usan `icon`;
- se definió `bonusMalusHistory` dentro del componente principal.

Se mantiene:

- Historial de temporada en curso y temporadas anteriores;
- detalle por jugador;
- promedios por categoría;
- faltas y penalizaciones;
- Bonus/Malus;
- formato visible sobre 100 con un decimal (`81.7`, `74.2`, etc.).

No requiere SQL nuevo.

### Publicación

Reemplazá:

```text
app/page.tsx
README.md
```

`globals.css` puede quedar como el de v11.4.

Luego:

```bash
npm.cmd run build
```

Si compila:

```bash
git add .
git commit -m "Corregir build historial de temporadas"
git push
```
