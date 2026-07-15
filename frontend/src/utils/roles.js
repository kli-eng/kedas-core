// frontend/src/utils/roles.js
// KEDAS v3.0.2 — Constantes RBAC alineadas al backend.
// Fuente de verdad: api/routers/auth.py líneas 51-76 (ROLES_VALIDOS + PERMISOS_ROL).

export const ROLES = {
  DOCENTE: "docente",
  UTP: "utp",
  APODERADO: "apoderado",
  DIRECTOR: "director",
  ORIENTADOR: "orientador",
  PSICOLOGO: "psicologo",
  COORDINADOR_CONVIVENCIA: "coordinador_convivencia",
  ADMIN: "admin"
};

// Espejo de PERMISOS_ROL del backend
export const PERMISOS_ROL = {
  docente: ["alertas:leer", "alertas:escribir", "estudiantes:leer"],
  utp: ["alertas:leer", "alertas:escribir", "estudiantes:leer", "reportes:leer", "predicciones:leer"],
  orientador: ["convivencia:leer", "convivencia:escribir", "asistencia:leer", "estudiantes:leer"],
  psicologo: ["convivencia:leer", "convivencia:escribir", "protocolos:leer", "protocolos:escribir", "asistencia:leer", "estudiantes:leer"],
  coordinador_convivencia: ["convivencia:leer", "convivencia:escribir", "reportes:leer", "reportes:escribir", "asistencia:leer"],
  director: ["convivencia:leer", "convivencia:escribir", "protocolos:leer", "reportes:leer", "reportes:escribir", "estudiantes:leer", "predicciones:leer", "alertas:leer"],
  apoderado: ["consentimientos:leer", "consentimientos:escribir", "progreso_propio:leer"],
  admin: ["*"]
};

export function tienePermiso(rol, permiso) {
  const permisos = PERMISOS_ROL[rol] || [];
  return permisos.includes("*") || permisos.includes(permiso);
}

// FE-01 — Menú agrupado por los 7 módulos DEC-30 (validados 10-jul-2026).
// Cada rol tiene 'transversales' (fuera de los módulos: Inicio, KIRA, Estudiantes,
// Canal Denuncias) y 'grupos' (ítems anidados bajo su módulo DEC-30 correspondiente).
// MOD-05 (Cumplimiento) y MOD-06 (Predicciones) usan ModuloProximamente.jsx
// como placeholder hasta que exista pantalla real.
export const MENU_POR_ROL = {
  docente: {
    transversales: [
      { label: "Inicio", path: "/dashboard" },
      { label: "✨ KIRA", path: "/dashboard/kira" },
      { label: "Estudiantes", path: "/dashboard/estudiantes" },
      { label: "Canal Denuncias", path: "/dashboard/denuncias" },
    ],
    grupos: [
      {
        modulo: "MOD-04",
        nombre: "Contenidos REA",
        items: [{ label: "Recursos (REA)", path: "/dashboard/rea" }],
      },
    ],
  },
  utp: {
    transversales: [
      { label: "Inicio", path: "/dashboard" },
      { label: "✨ KIRA", path: "/dashboard/kira" },
      { label: "Estudiantes", path: "/dashboard/estudiantes" },
      { label: "Canal Denuncias", path: "/dashboard/denuncias" },
    ],
    grupos: [
      {
        modulo: "MOD-03",
        nombre: "Inteligencia Curricular",
        items: [{ label: "Curricular", path: "/dashboard/curricular" }],
      },
      {
        modulo: "MOD-04",
        nombre: "Contenidos REA",
        items: [{ label: "Recursos (REA)", path: "/dashboard/rea" }],
      },
      {
        modulo: "MOD-06",
        nombre: "Predicciones",
        items: [{ label: "Predicciones", path: "/dashboard/predicciones" }],
      },
    ],
  },
  director: {
    transversales: [
      { label: "Inicio", path: "/dashboard" },
      { label: "✨ KIRA", path: "/dashboard/kira" },
      { label: "Estudiantes", path: "/dashboard/estudiantes" },
      { label: "Canal Denuncias", path: "/dashboard/denuncias" },
    ],
    grupos: [
      {
        modulo: "MOD-02",
        nombre: "Convivencia Escolar",
        items: [
          { label: "Convivencia", path: "/dashboard/convivencia" },
          { label: "Reportes", path: "/dashboard/reportes" },
        ],
      },
      {
        modulo: "MOD-03",
        nombre: "Inteligencia Curricular",
        items: [{ label: "Curricular", path: "/dashboard/curricular" }],
      },
      {
        modulo: "MOD-05",
        nombre: "Cumplimiento Normativo",
        items: [{ label: "Cumplimiento", path: "/dashboard/cumplimiento" }],
      },
      {
        modulo: "MOD-06",
        nombre: "Predicciones",
        items: [{ label: "Predicciones", path: "/dashboard/predicciones" }],
      },
    ],
  },
  orientador: {
    transversales: [
      { label: "Inicio", path: "/dashboard" },
      { label: "✨ KIRA", path: "/dashboard/kira" },
      { label: "Estudiantes", path: "/dashboard/estudiantes" },
      { label: "Canal Denuncias", path: "/dashboard/denuncias" },
    ],
    grupos: [
      {
        modulo: "MOD-02",
        nombre: "Convivencia Escolar",
        items: [
          { label: "Convivencia", path: "/dashboard/convivencia" },
          { label: "Registrar Incidente", path: "/dashboard/incidente" },
        ],
      },
    ],
  },
  psicologo: {
    transversales: [
      { label: "Inicio", path: "/dashboard" },
      { label: "✨ KIRA", path: "/dashboard/kira" },
      { label: "Estudiantes", path: "/dashboard/estudiantes" },
      { label: "Canal Denuncias", path: "/dashboard/denuncias" },
    ],
    grupos: [
      {
        modulo: "MOD-02",
        nombre: "Convivencia Escolar",
        items: [
          { label: "Convivencia", path: "/dashboard/convivencia" },
          { label: "Registrar Incidente", path: "/dashboard/incidente" },
        ],
      },
    ],
  },
  coordinador_convivencia: {
    transversales: [
      { label: "Inicio", path: "/dashboard" },
      { label: "✨ KIRA", path: "/dashboard/kira" },
      { label: "Canal Denuncias", path: "/dashboard/denuncias" },
    ],
    grupos: [
      {
        modulo: "MOD-02",
        nombre: "Convivencia Escolar",
        items: [
          { label: "Convivencia", path: "/dashboard/convivencia" },
          { label: "Reportes SLEP", path: "/dashboard/reportes" },
          { label: "Registrar Incidente", path: "/dashboard/incidente" },
        ],
      },
    ],
  },
  slep_tecnico: {
    transversales: [
      { label: "Inicio", path: "/dashboard" },
      { label: "Convivencia SLEP", path: "/dashboard" },
    ],
    grupos: [],
  },
  apoderado: {
    transversales: [{ label: "Inicio", path: "/dashboard" }],
    grupos: [
      {
        modulo: "MOD-07",
        nombre: "Participación",
        items: [{ label: "Consentimientos", path: "/dashboard/consentimientos" }],
      },
    ],
  },
  admin: {
    transversales: [
      { label: "Inicio", path: "/dashboard" },
      { label: "Usuarios", path: "/dashboard/usuarios" },
      { label: "Sistema", path: "/dashboard/sistema" },
    ],
    grupos: [
      {
        modulo: "MOD-05",
        nombre: "Cumplimiento Normativo",
        items: [{ label: "Cumplimiento", path: "/dashboard/cumplimiento" }],
      },
    ],
  },
};

export const NOMBRE_ROL = {
  docente: "Docente",
  utp: "Jefe UTP",
  apoderado: "Apoderado/a",
  director: "Director/a",
  orientador: "Orientador/a",
  psicologo: "Psicólogo/a",
  coordinador_convivencia: "Coordinador/a Convivencia",
  slep_tecnico: "Técnico/a SLEP",
  admin: "Administrador/a"
};

// Mapeo gravedad (INTEGER 1-3 en kedas_conv_incidentes)
export const GRAVEDAD = {
  1: { label: "Leve", color: "bg-yellow-100 text-yellow-800" },
  2: { label: "Grave", color: "bg-orange-100 text-orange-800" },
  3: { label: "Muy grave", color: "bg-red-100 text-red-800" }
};
