# KEDAS Core

Plataforma de inteligencia escolar — componentes de licencia abierta (AGPL v3).

KEDAS es un sistema de inteligencia educativa que opera 100% en el servidor
del establecimiento o del SLEP — ningún dato de estudiantes sale del control
de la institución. Kairós Learning Intelligent (KLI).

## Qué incluye este repositorio

- Autenticación y gestión de usuarios (RBAC 9 roles)
- Perfil 360° de estudiantes
- Dashboards base por rol
- Integración de lectura con Kolibri
- Catálogo de Recursos Educativos Abiertos (REA)
- Panel de administración (usuarios, establecimientos)

## Qué NO incluye (Licencia Comercial KLI — Tier 1 Compliance Plus, repo
privado kedas)

Confirmado contra KEDAS_Plan_Comercial_v2.0 (8-jul-2026) y
KEDAS_Decision_Licencia_v2 — documentos internos de KLI:

- Módulo de Inteligencia Curricular (correlación DIA-SIMCE-Kolibri) — Tier 2
- KIRA — Asistente Pedagógico con IA local — Tier 1
- Predicción de riesgo académico (ML) — Tier 2
- Convivencia avanzada (protocolos Ley 21.809, alertas ML) — Tier 1
- Reportes institucionales SLEP — Tier 1
- Portal Apoderado + consentimientos — Tier 1
- Canal de Denuncias Ley Karin — Tier 1
- Pseudonimización pgcrypto AES-256 — Tier 1

## Estado de este export — 13-jul-2026 (DEC-41)

Este repositorio es una **exportación curada** de los módulos Core,
generada a partir del monolito interno de KEDAS. Actualmente:

- `api/main.py` y `frontend/src/services/api.js` se copiaron tal cual y
  pueden contener referencias a endpoints/funciones que solo existen en
  kedas — la separación funcional completa (para que este
  repo sea 100% autoinstalable de forma independiente) es un trabajo
  pendiente de Sprint 6 (INST-01b).
- El historial de commits no se preservó — es un export limpio, no un
  `git subtree split`.

Ver `KEDAS_DEC41_INST01a_Mapeo_CorePremium_13jul2026.docx` (documento
interno KLI) para el detalle completo de la clasificación archivo por
archivo y su razonamiento.

## Licencia

AGPL v3 — ver `LICENSE`. Contribuciones sujetas a CLA (ver `CONTRIBUTORS.md`
en el repositorio kedas).

---

© 2025-2026 José Luis Cartagena Videla — Kairós Learning Intelligent SpA
