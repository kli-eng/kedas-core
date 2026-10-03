# KEDAS Core

Núcleo de código abierto (licencia AGPL v3) de **KEDAS**, la plataforma de inteligencia escolar de Kairós Learning Intelligent (KLI) para establecimientos educacionales de Chile.

## Estado del proyecto

- KEDAS **aún no está instalado en ningún establecimiento**. Hasta hoy se ha validado en un piloto acotado en 2025 y con datos de demostración, en servidores contratados por KLI.
- Está **diseñado** para instalarse en un servidor dentro del establecimiento o del sostenedor. Allí se guardarían y procesarían los datos de los estudiantes y, en la edición completa, la inteligencia artificial (asistente pedagógico y predicción de riesgo) funcionaría en ese mismo servidor, sin enviar datos a servicios externos de IA. Las copias de respaldo hacia un proveedor externo y el envío de correos solo existen si quien instala los configura.
- Este repositorio es una **exportación parcial** de los componentes de licencia abierta y **todavía no es autoinstalable de forma independiente**: `api/main.py` y `frontend/src/services/api.js` conservan referencias a funciones que solo existen en la edición comercial, y `scripts/install.sh` menciona servicios (como `ollama` y `mlflow`) que el `docker-compose.yml` de este repositorio no define.

## Qué incluye este repositorio

- Autenticación y gestión de usuarios (control de acceso por 9 roles)
- Perfil de estudiantes (vista 360°)
- Paneles base por rol
- Lectura de registros de Kolibri exportados en CSV
- Catálogo de Recursos Educativos Abiertos (REA)
- Panel de administración (usuarios y establecimientos)

## Qué no incluye (edición comercial de KLI, bajo licencia comercial)

- Inteligencia curricular (correlación DIA–SIMCE–Kolibri)
- KIRA, asistente pedagógico con IA local
- Predicción de riesgo académico
- Convivencia escolar avanzada (protocolos y alertas)
- Reportes institucionales para SLEP
- Portal de apoderados y consentimientos
- Canal de denuncias (Ley Karin)
- Pseudonimización con cifrado en la base de datos

## Contribuciones y seguridad

- Por ahora **no se aceptan contribuciones externas**: antes se publicará un acuerdo de contribución (CLA). Si quieres colaborar, escribe a hola@kli.cl.
- Para informar una vulnerabilidad o un problema de privacidad, escribe a hola@kli.cl. No publiques datos personales en incidencias ni en solicitudes de extracción.

## Licencia

AGPL v3, ver [`LICENSE`](LICENSE).

© 2025-2026 José Luis Cartagena Videla. Mantenido por Kairós Learning Intelligent (KLI) SpA · hola@kli.cl · kli.cl
