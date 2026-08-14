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

## ⚠️ IMPORTANTE: no usar `sort -V` para aplicar estas migraciones

`010_kedas_slep_rea.sql`, `010b_fix_slep_nombre_establecimiento.sql` y
`010c_fk_establecimientos_slep.sql` NO se ordenan correctamente con
`ls migrations/*.sql | sort -V` — `010b` y `010c` terminan antes que
`010`, y fallan porque `kedas_slep` todavía no existe. Aplicar siempre
en el orden EXPLÍCITO de la lista de abajo.

## Orden real de instalación (validado)

```
001_schema_fundacional.sql
004_kedas_usuarios.sql
008_kedas_kolibri_cache.sql
009_kedas_interacciones_kolibri.sql
009b_fn_set_updated_at.sql
010_kedas_slep_rea.sql
010b_fix_slep_nombre_establecimiento.sql
010c_fk_establecimientos_slep.sql
```

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
- Probar `install.sh` de kedas-core end-to-end contra estas migraciones
  (hoy solo se probó aplicando los .sql directo con psql, no a través
  del script de instalación real).
