# Orden de instalación desde cero — KEDAS Core

Reconstruido y validado el 29-jul-2026 (DEC-59), en una base de datos
desechable, sin tocar producción.

## Contexto

Antes de esta fecha, kedas-core no tenía carpeta `migrations/` en
absoluto — una instalación desde el repo público no podía crear ni una
sola tabla. Se reconstruyó extrayendo el subconjunto de 12 tablas que
`auth.py`, `estudiantes.py`, `dashboard.py`, `kolibri.py`, `admin.py` y
`rea.py` realmente necesitan, filtrando la migración fundacional ya
validada en el repo Premium (`kedas/migrations/001_schema_fundacional.sql`).

## Orden de aplicación

Los nombres de archivo ya ordenan correctamente, tanto con `sort -V`
como con `LC_ALL=C sort` (009 y 010 se renombraron a 009a y 010a el
17-oct-2026). `scripts/install.sh` las aplica en ese orden y se detiene
ante el primer error (`ON_ERROR_STOP`).

```
001_schema_fundacional.sql
004_kedas_usuarios.sql
008_kedas_kolibri_cache.sql
009a_kedas_interacciones_kolibri.sql
009b_fn_set_updated_at.sql
010a_kedas_slep_rea.sql
010c_fk_establecimientos_slep.sql
011_credenciales.sql
```

`kedas_slep` se crea vacía: Core no incluye datos de ninguna
instalación real. (La antigua `010b`, que corregía el nombre de un
SLEP en una base existente, se retiró porque no aplica a instalaciones
nuevas.)

El instalador aplica estas migraciones solo sobre una base vacía. Si la
base ya tiene `kedas_usuarios`, no aplica ninguna y avisa: las
migraciones nuevas de una base existente se aplican a mano, una por
una, con respaldo previo.

## Tablas resultantes (12 + 1 sin uso)

kedas_asistencia, kedas_audit_log, kedas_cursos, kedas_establecimientos,
kedas_interacciones_kolibri, kedas_kolibri_cache, kedas_kolibri_online,
kedas_kolibri_online_resumido, kedas_pseudonimos, kedas_rea, kedas_slep,
kedas_usuarios.

`kedas_rea_kudos` también se crea (viene en el mismo archivo que
kedas_rea/kedas_slep) pero rea.py no la usa hoy — tabla sin uso,
inofensiva, no es una fuga de Premium.

## Pendiente

- `modulos_manifest.json` y `resolver_migraciones.py` (mencionados en el
  handoff del 14-jul-2026 como ya publicados, pero nunca quedaron en el
  historial de git — se perdieron en algún squash+force-push de DEC-43,
  sin dejar rastro). Decidir si reconstruirlos con la misma sofisticación
  original o con un diseño más simple. Ver DEC-59.
- Registrar las migraciones aplicadas en una tabla propia, para poder
  aplicar solo las nuevas en una base existente.
