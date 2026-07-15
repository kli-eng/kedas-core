// frontend/src/components/Layout/OnboardingModal.jsx
// KEDAS v3.4.0 — S5-03: Pantalla de onboarding por rol (primer login)
// Se muestra una sola vez por rol. Flag: localStorage kedas_onboard_v1_${role}
import { useState, useEffect } from "react";

const ONBOARDING = {
  docente: {
    titulo:    "Bienvenido/a a KEDAS — Vista Docente",
    icono:     "📚",
    pasos: [
      {
        titulo: "Tus estudiantes en Kolibri",
        texto:  "Puedes ver las sesiones de trabajo de tus estudiantes en la plataforma Kolibri: tiempo de uso, recursos completados y nivel de avance por asignatura.",
      },
      {
        titulo: "Privacidad de datos — cómo funciona",
        texto:  "Los nombres de tus estudiantes aparecen normalmente en la interfaz. Internamente, KEDAS usa un código seudónimo para proteger la privacidad (Ley 21.719). Esto ocurre de forma automática — tú ves los nombres, el sistema protege los datos.",
      },
      {
        titulo: "Si detectas un problema de convivencia",
        texto:  "Comunícalo al orientador/a o psicólogo/a del establecimiento — ellos son los responsables de registrarlo en el sistema. Tu rol en KEDAS es el seguimiento del progreso académico de tus estudiantes.",
      },
    ],
  },

  utp: {
    titulo: "Bienvenido/a a KEDAS — Jefatura UTP",
    icono:  "📊",
    pasos: [
      {
        titulo: "Vista agregada de todos los cursos",
        texto:  "Tu dashboard muestra el estado de riesgo académico por curso, basado en las sesiones Kolibri. Puedes identificar qué cursos necesitan más apoyo pedagógico.",
      },
      {
        titulo: "Priorización basada en datos",
        texto:  "El dashboard muestra qué cursos tienen menor actividad en Kolibri y más rezago en recursos. Úsalo para decidir en qué cursos concentrar el apoyo pedagógico esta semana.",
      },
      {
        titulo: "Recursos Educativos Abiertos (REA)",
        texto:  "En la sección REA encontrarás materiales disponibles para complementar las rutas de aprendizaje de los estudiantes con mayor rezago.",
      },
    ],
  },

  director: {
    titulo: "Bienvenido/a a KEDAS — Dirección",
    icono:  "🏫",
    pasos: [
      {
        titulo: "KPIs generales del establecimiento",
        texto:  "Tu dashboard muestra el estado de riesgo académico, alertas de convivencia activas, alertas vencidas y cumplimiento normativo del RICE en tiempo real.",
      },
      {
        titulo: "Alertas vencidas requieren tu atención",
        texto:  "Si una alerta no ha sido revisada en 5 días hábiles (plazo interno de KEDAS para garantizar respuesta oportuna), escala visualmente en tu dashboard. Puedes supervisar el cumplimiento desde aquí.",
      },
      {
        titulo: "Verificador RICE",
        texto:  "KEDAS puede verificar el cumplimiento del Reglamento Interno con la Ley 21.809, Ley 21.801 (dispositivos móviles) y Ley 21.545 (TEA). El plazo para actualizar el RICE venció el 30 de junio de 2026.",
      },
    ],
  },

  orientador: {
    titulo: "Bienvenido/a a KEDAS — Orientación",
    icono:  "🔔",
    pasos: [
      {
        titulo: "Las alertas las genera el modelo ML, tú las decides",
        texto:  "El sistema detecta patrones de riesgo académico automáticamente. Pero ninguna alerta genera consecuencias sobre un estudiante sin tu confirmación explícita. Esto es un requisito legal (Art. 8° bis Ley 21.719).",
      },
      {
        titulo: "Tienes 5 días hábiles por alerta",
        texto:  "Cada alerta debe ser confirmada (con acción de intervención) o desestimada (con justificación escrita) dentro de 5 días hábiles. Las alertas vencidas escalan al director.",
      },
      {
        titulo: "Registro rápido para el recreo",
        texto:  "El Registro Rápido (botón rojo) funciona también desde el navegador de tu móvil. El incidente queda pendiente de completar — puedes agregar descripción y acciones tomadas desde tu dashboard cuando tengas más tiempo.",
      },
    ],
  },

  psicologo: {
    titulo: "Bienvenido/a a KEDAS — Psicología",
    icono:  "🧠",
    pasos: [
      {
        titulo: "Protocolos formales — solo tú y el director",
        texto:  "Los incidentes de tipo salud mental, vulneración de derechos, acoso escolar y consumo de sustancias generan automáticamente un protocolo formal cifrado. Solo la Dupla Psicosocial y el Director pueden acceder a ellos.",
      },
      {
        titulo: "Los datos están cifrados (Art. 2°g Ley 21.719)",
        texto:  "Los protocolos se almacenan con cifrado AES-256. Toda acción queda registrada en la bitácora de auditoría con fecha y actor. Esto protege a los estudiantes y al establecimiento.",
      },
      {
        titulo: "Canal de Denuncias Ley Karin",
        texto:  "En el menú lateral encontrarás el Canal de Denuncias para situaciones de acoso laboral, violencia en el trabajo y acoso sexual que afecten al personal del establecimiento (Ley 21.643).",
      },
    ],
  },

  coordinador_convivencia: {
    titulo: "Bienvenido/a a KEDAS — Coordinación Convivencia",
    icono:  "⚖️",
    pasos: [
      {
        titulo: "Supervisa los plazos legales",
        texto:  "Tu rol es verificar que cada alerta e incidente sea atendido dentro de los 5 días hábiles que exige el protocolo. El dashboard muestra el estado de cumplimiento en tiempo real.",
      },
      {
        titulo: "Incidentes pendientes de completar",
        texto:  "Los incidentes registrados con Registro Rápido (3 clicks) quedan pendientes de completar con descripción y acciones tomadas. Puedes ver y gestionar esos pendientes desde tu vista.",
      },
      {
        titulo: "Reportes de convivencia",
        texto:  "En la sección Reportes puedes generar resúmenes de incidentes por tipo, gravedad y período para informar al SLEP o a la Superintendencia de Educación.",
      },
    ],
  },

  apoderado: {
    titulo: "Bienvenido/a al Portal de Apoderado",
    icono:  "👨‍👩‍👧",
    pasos: [
      {
        titulo: "Tus consentimientos, tu control",
        texto:  "KEDAS usa los datos de tu hijo/a solo con tu autorización. Puedes activar o revocar cada tipo de uso en cualquier momento desde este portal.",
      },
      {
        titulo: "4 capas de consentimiento",
        texto:  "Capa 1: datos básicos de matrícula (siempre activa). Capa 2: IA predictiva de riesgo académico (opt-in, puedes desactivarla). Capa 3: datos de convivencia. Capa 4: investigación educativa anonimizada. Cada capa es independiente y revocable.",
      },
      {
        titulo: "Tus datos permanecen en el colegio",
        texto:  "Los datos de tu hijo/a nunca salen del servidor del establecimiento. KEDAS no los comparte con servicios en la nube externos (Ley 21.719 de Protección de Datos Personales).",
      },
    ],
  },

  admin: {
    titulo: "Bienvenido/a a KEDAS — Administración",
    icono:  "⚙️",
    pasos: [
      {
        titulo: "Acceso completo al sistema",
        texto:  "Desde el panel de administración puedes gestionar usuarios, roles, establecimientos y configuración del sistema. Usa este acceso con cuidado — toda acción queda en la bitácora de auditoría.",
      },
      {
        titulo: "Gestión de usuarios y roles",
        texto:  "Puedes crear usuarios para cada rol del establecimiento (docente, orientador, psicólogo, director, etc.) y asignarlos al establecimiento correspondiente.",
      },
      {
        titulo: "Sincronización de datos Kolibri",
        texto:  "El sistema procesa automáticamente los datos de sesiones de tus estudiantes cada 6 horas. Si los datos no se actualizan, contacta al soporte técnico de KLI.",
      },
    ],
  },

  slep_tecnico: {
    titulo: "Bienvenido/a a KEDAS — SLEP Técnico",
    icono:  "🏛️",
    pasos: [
      {
        titulo: "KPIs agregados de todos los establecimientos",
        texto:  "Tu vista muestra indicadores consolidados a nivel SLEP: riesgo académico promedio, alertas activas, incidentes por tipo y cumplimiento normativo por establecimiento.",
      },
      {
        titulo: "Sin acceso a datos individuales",
        texto:  "Por diseño legal (Ley 21.719 Art. 14°), el rol SLEP técnico solo accede a datos agregados y anonimizados. Los datos individuales de estudiantes solo son visibles para el personal del establecimiento.",
      },
      {
        titulo: "Auditoría y cumplimiento",
        texto:  "Puedes revisar el estado de cumplimiento normativo de cada establecimiento del SLEP y generar reportes para la Superintendencia de Educación.",
      },
    ],
  },
};

const DEFAULT_ONBOARDING = {
  titulo: "Bienvenido/a a KEDAS",
  icono:  "✅",
  pasos: [
    {
      titulo: "Sistema de Inteligencia Escolar Local",
      texto:  "KEDAS procesa datos educativos localmente — ningún dato sale del servidor del establecimiento. Toda acción queda registrada en la bitácora de auditoría.",
    },
  ],
};

export default function OnboardingModal({ user, onCerrar, forzarMostrar = false }) {
  const config = ONBOARDING[user?.role] || DEFAULT_ONBOARDING;
  const [paso, setPaso] = useState(0);

  const total = config.pasos.length;
  const esUltimo = paso === total - 1;

  const handleSiguiente = () => {
    if (esUltimo) { onCerrar(); }
    else { setPaso(p => p + 1); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-kedas-primary to-blue-700 px-6 py-5 text-white">
          <div className="text-3xl mb-2">{config.icono}</div>
          <h2 className="text-xl font-bold leading-tight">{config.titulo}</h2>
          <p className="text-blue-200 text-xs mt-1">
            KEDAS v3.4.0 · Kairós Learning Intelligent · {user?.nombre_establecimiento || "Establecimiento"}
          </p>
        </div>

        {/* Indicador de pasos */}
        <div className="flex gap-1.5 px-6 pt-4">
          {config.pasos.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full flex-1 transition-all ${
                i <= paso ? "bg-kedas-primary" : "bg-slate-200"
              }`}
            />
          ))}
        </div>

        {/* Contenido del paso */}
        <div className="px-6 py-5 min-h-[160px]">
          <h3 className="text-base font-semibold text-slate-800 mb-2">
            {config.pasos[paso].titulo}
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            {config.pasos[paso].texto}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {paso + 1} de {total}
          </span>
          <div className="flex gap-2">
            {paso > 0 && (
              <button
                onClick={() => setPaso(p => p - 1)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Anterior
              </button>
            )}
            <button
              onClick={handleSiguiente}
              className="px-5 py-2 text-sm bg-kedas-primary hover:bg-blue-800
                         text-white rounded-lg font-medium transition-colors"
            >
              {esUltimo ? "Entendido, comenzar ✓" : "Siguiente →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook para gestionar el estado del onboarding
export function useOnboarding(user) {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    if (!user?.role) return;
    const flag = localStorage.getItem(`kedas_onboard_v1_${user.role}`);
    if (!flag) setMostrar(true);
  }, [user?.role]);

  const cerrar = () => {
    if (user?.role) {
      localStorage.setItem(`kedas_onboard_v1_${user.role}`, "1");
    }
    setMostrar(false);
  };

  return { mostrar, cerrar };
}
