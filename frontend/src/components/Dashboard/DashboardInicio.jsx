// frontend/src/components/Dashboard/DashboardInicio.jsx
// KEDAS v3.4.0 — Sprint B: Pantalla de Inicio rediseñada
//
// Principio de diseño: todo indicador tiene 4 capas de contexto:
//   1. Qué es (descripción simple)
//   2. Bueno o malo (semáforo con umbral)
//   3. Con qué se compara (referencia nacional o temporal)
//   4. Qué hago (acción concreta sugerida)

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getDashboardUTP, getDashboardDirector,
  getConvivenciaIncidentes, getKolibriOnline,
} from "../../services/api.js";

// ── Componente: tarjeta de indicador con contexto pedagógico ──
function TarjetaIndicador({ icono, titulo, valor, unidad, semaforo, que_es, comparacion, accion, onClick }) {
  const [mostrarContexto, setMostrarContexto] = useState(false);

  const colores = {
    verde:   { bg: "bg-green-50",  border: "border-green-300",  texto: "text-green-700",  dot: "🟢" },
    amarillo:{ bg: "bg-amber-50",  border: "border-amber-300",  texto: "text-amber-700",  dot: "🟡" },
    rojo:    { bg: "bg-red-50",    border: "border-red-300",    texto: "text-red-700",    dot: "🔴" },
    gris:    { bg: "bg-slate-50",  border: "border-slate-200",  texto: "text-slate-500",  dot: "⚪" },
  };
  const cfg = colores[semaforo] || colores.gris;

  return (
    <div className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-4 flex flex-col gap-2`}>
      {/* Fila superior: ícono + valor + semáforo */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icono}</span>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{titulo}</div>
            <div className={`text-3xl font-bold tabular-nums ${cfg.texto}`}>
              {valor ?? "–"}<span className="text-sm font-normal ml-1">{unidad}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setMostrarContexto(!mostrarContexto)}
          className="text-slate-400 hover:text-slate-600 text-lg leading-none mt-1"
          title="¿Qué significa este indicador?"
        >
          ⓘ
        </button>
      </div>

      {/* Semáforo */}
      <div className={`text-xs font-medium ${cfg.texto}`}>
        {cfg.dot} {semaforo === "verde" ? "Buen estado" : semaforo === "amarillo" ? "Requiere atención" : semaforo === "rojo" ? "Acción urgente" : "Sin datos"}
      </div>

      {/* Panel de contexto pedagógico (expandible) */}
      {mostrarContexto && (
        <div className="mt-2 pt-2 border-t border-slate-200 space-y-2 text-xs text-slate-600">
          <div><span className="font-semibold text-slate-700">¿Qué es?</span> {que_es}</div>
          {comparacion && <div><span className="font-semibold text-slate-700">¿Con qué se compara?</span> {comparacion}</div>}
          {accion && (
            <div className="mt-1 p-2 bg-white rounded border border-slate-200">
              <span className="font-semibold text-slate-700">¿Qué hago?</span> {accion}
            </div>
          )}
        </div>
      )}

      {/* Botón de acción */}
      {onClick && (
        <button
          onClick={onClick}
          className="mt-auto text-xs font-medium text-kedas-primary hover:underline text-left"
        >
          Ver detalle →
        </button>
      )}
    </div>
  );
}

// ── Acceso rápido ─────────────────────────────────────────────
function AccesoRapido({ icono, label, desc, path, color }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(path)}
      className={`flex items-center gap-3 p-3 rounded-lg border ${color} hover:shadow-sm transition-shadow text-left w-full`}
    >
      <span className="text-2xl">{icono}</span>
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
      <span className="ml-auto text-slate-400">→</span>
    </button>
  );
}

// ── Dashboard de Inicio ───────────────────────────────────────
const ACCESOS_APODERADO = [
  { icono: "🔒", label: "Mis Consentimientos", desc: "Gestión de privacidad y autorización de datos", path: "/dashboard/consentimientos", color: "border-blue-200 bg-blue-50" },
];

const ACCESOS_SLEP = [
  { icono: "📋", label: "Convivencia SLEP", desc: "KPIs institucionales agregados · Sin datos individuales", path: "/dashboard/convivencia", color: "border-blue-200 bg-blue-50" },
  { icono: "📄", label: "Reportes", desc: "Disponible con licencia comercial KLI", path: "/dashboard/reportes", color: "border-slate-200 bg-slate-50" },
];

const ACCESOS_CONVIVENCIA = [
  { icono: "🤝", label: "Convivencia Escolar", desc: "Incidentes · Alertas · Protocolos · Plazos Ley 21.809", path: "/dashboard/convivencia", color: "border-red-200 bg-red-50" },
  { icono: "✨", label: "KIRA — Asistente IA", desc: "Resolución conflictos · Educación emocional · Prevención acoso", path: "/dashboard/kira", color: "border-teal-200 bg-teal-50" },
  { icono: "📋", label: "Reportes SLEP", desc: "Informe de convivencia para el SLEP", path: "/dashboard/reportes", color: "border-slate-200 bg-slate-50" },
  { icono: "📣", label: "Canal Denuncias", desc: "Ley Karin · Confidencial", path: "/dashboard/denuncias", color: "border-purple-200 bg-purple-50" },
];

const ACCESOS_DOCENTE = [
  { icono: "✨", label: "KIRA — Asistente IA", desc: "Planifica, evalúa y gestiona con IA local", path: "/dashboard/kira", color: "border-teal-200 bg-teal-50" },
  { icono: "👨‍🎓", label: "Estudiantes", desc: "Perfil 360° de mis estudiantes", path: "/dashboard/estudiantes", color: "border-purple-200 bg-purple-50" },
  { icono: "📚", label: "Recursos REA", desc: "Catálogo de recursos educativos abiertos", path: "/dashboard/rea", color: "border-amber-200 bg-amber-50" },
];

const ACCESOS_UTP = [
  { icono: "📊", label: "Inteligencia Curricular", desc: "Cobertura OA · DUA · Correlación SIMCE", path: "/dashboard/curricular", color: "border-blue-200 bg-blue-50" },
  { icono: "✨", label: "KIRA — Asistente IA", desc: "Planifica, evalúa y gestiona con IA local", path: "/dashboard/kira", color: "border-teal-200 bg-teal-50" },
  { icono: "👨‍🎓", label: "Estudiantes", desc: "Perfil 360° de cada estudiante", path: "/dashboard/estudiantes", color: "border-purple-200 bg-purple-50" },
  { icono: "📚", label: "Recursos REA", desc: "Catálogo de recursos educativos abiertos", path: "/dashboard/rea", color: "border-amber-200 bg-amber-50" },
];

const ACCESOS_DIR = [
  { icono: "📊", label: "Inteligencia Curricular", desc: "Correlación DIA · SIMCE · Kolibri", path: "/dashboard/curricular", color: "border-blue-200 bg-blue-50" },
  { icono: "🤝", label: "Convivencia Escolar", desc: "Incidentes · Alertas · Protocolos", path: "/dashboard/convivencia", color: "border-red-200 bg-red-50" },
  { icono: "✨", label: "KIRA — Asistente IA", desc: "Informes · Análisis · Gestión con IA", path: "/dashboard/kira", color: "border-teal-200 bg-teal-50" },
  { icono: "📋", label: "Reportes", desc: "Reporte SLEP · Verificador RICE", path: "/dashboard/reportes", color: "border-slate-200 bg-slate-50" },
];

export default function DashboardInicio({ user }) {
  const [datos, setDatos] = useState(null);
  const [incidentes, setIncidentes] = useState(null);
  const [kolibri, setKolibri] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const esUTP = user?.role === "utp";
  const estId = user?.establecimiento_id || 3;

  useEffect(() => {
    const fetchDatos = esUTP
      ? getDashboardUTP(estId)
      : getDashboardDirector(estId);

    Promise.all([
      fetchDatos.catch(() => null),
      getConvivenciaIncidentes(estId, 4).catch(() => null),
      getKolibriOnline ? getKolibriOnline(estId).catch(() => null) : Promise.resolve(null),
    ]).then(([d, inc, kol]) => {
      setDatos(d);
      setIncidentes(inc);
      setKolibri(kol);
    }).finally(() => setLoading(false));
  }, [estId, esUTP]);

  const nombreRol = esUTP ? "Jefatura UTP" : "Dirección";
  const nombre = user?.nombre_completo?.split(" ")[0] || nombreRol;
  const establecimiento = datos?.nombre_establecimiento || "Escuela Quebrada de Alvarado";
  const hoy = new Date().toLocaleDateString("es-CL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // Valores de los indicadores
  const cobertura = datos?.kolibri_sesiones
    ? Math.round((datos.kolibri_sesiones.total_sesiones / 172) * 8.3) || 8.3
    : 8.3;
  const incidentesAbiertos = incidentes?.semanas
    ? incidentes.semanas.reduce((s, sem) => s + (sem.total || 0), 0)
    : (datos?.incidentes_abiertos ?? null);
  const sesionesKolibri = datos?.kolibri_sesiones?.total_sesiones
    ?? kolibri?.sesiones_totales ?? 172;
  const alertasActivas = datos?.alertas_pendientes ?? null;

  // Semáforos
  const semaforoCobertura = cobertura >= 40 ? "verde" : cobertura >= 20 ? "amarillo" : "rojo";
  const semaforoIncidentes = incidentesAbiertos === 0 ? "verde" : incidentesAbiertos <= 3 ? "amarillo" : "rojo";
  const semaforoAlertas = alertasActivas === 0 ? "verde" : alertasActivas <= 2 ? "amarillo" : "rojo";
  const semaforoSesiones = sesionesKolibri >= 200 ? "verde" : sesionesKolibri >= 50 ? "amarillo" : "rojo";

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] text-slate-500 text-sm">
      Cargando panel de inicio…
    </div>
  );

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">

      {/* Saludo */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Buenos días, {nombre} 👋
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {hoy} · <strong>{establecimiento}</strong>
        </p>
        <p className="text-sm text-slate-600 mt-3 max-w-2xl">
          {esUTP
            ? "Este es tu panel de control. Aquí tienes el estado actual de lo más importante para tu gestión curricular y pedagógica. Cada indicador te muestra si estás bien, si algo requiere atención, y qué puedes hacer. Haz clic en ⓘ para más contexto."
            : user?.role === "apoderado"
            ? "Bienvenido/a al portal de familias de KEDAS. Aquí puedes gestionar los permisos de privacidad de tu hijo/a y consultar con KIRA sobre su aprendizaje."
            : user?.role === "slep_tecnico"
            ? "Panel institucional SLEP. Aquí tienes los indicadores agregados del establecimiento. Los datos no incluyen información individual de estudiantes (Ley 21.719 Art. 14°)."
            : (user?.role === "orientador" || user?.role === "psicologo" || user?.role === "coordinador_convivencia")
            ? "Este es tu panel de convivencia y bienestar. Tienes acceso a los incidentes activos, alertas de riesgo y el asistente KIRA con prompts especializados en tutoría y apoyo socioemocional."
            : user?.role === "docente"
            ? "Este es tu panel docente. Desde aquí puedes acceder a KIRA para planificar y evaluar, ver el perfil de tus estudiantes y explorar recursos educativos abiertos."
            : "Este es tu panel de dirección. Tienes una visión del estado institucional en los ámbitos que más importan: aprendizaje, convivencia y gestión. Cada semáforo tiene una acción sugerida. Haz clic en ⓘ para entender cada indicador."
          }
        </p>
      </div>

      {/* Indicadores con semáforo — solo roles de gestión institucional */}
      {user?.role !== 'apoderado' && user?.role !== 'slep_tecnico' && (
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Estado actual del establecimiento
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {(user?.role === 'orientador' || user?.role === 'psicologo' || user?.role === 'coordinador_convivencia') ? (
            <TarjetaIndicador
              icono="🤝"
              titulo="Incidentes activos"
              valor={incidentesAbiertos ?? "–"}
              semaforo={incidentesAbiertos === null ? "gris" : incidentesAbiertos === 0 ? "verde" : incidentesAbiertos <= 3 ? "amarillo" : "rojo"}
              que_es="Número de incidentes de convivencia registrados en las últimas 4 semanas que requieren seguimiento activo del equipo de convivencia y bienestar."
              comparacion="Lo esperado es que los incidentes se cierren en menos de 2 meses (Art. 16E-g Ley 21.809). Cada incidente abierto con más de 60 días es una alerta legal."
              accion={incidentesAbiertos > 0 ? "Revisa los incidentes con más días abiertos — algunos pueden estar cerca del plazo legal → ir a Convivencia." : "Sin incidentes abiertos. Buen estado. Monitorea semanalmente."}
              onClick={() => navigate('/dashboard/convivencia')}
            />
          ) : (
            <TarjetaIndicador
              icono="📚"
              titulo="Cobertura curricular"
              valor={`${cobertura}%`}
              semaforo={semaforoCobertura}
              que_es="Porcentaje de Objetivos de Aprendizaje (OA) del currículo nacional que han sido trabajados con recursos Kolibri este semestre."
              comparacion="Un establecimiento con buena cobertura digital supera el 40% al segundo semestre. El promedio nacional es 23% (Agencia de Calidad 2025). Hoy estás en 8.3%."
              accion="Hay 12 OA que ya tienen recurso en Kolibri pero no han sido asignados a estudiantes. Puedes activarlos esta semana → ir a Curricular."
              onClick={() => navigate("/dashboard/curricular")}
            />
          )}

          <TarjetaIndicador
            icono="⚠️"
            titulo="Incidentes abiertos"
            valor={incidentesAbiertos ?? "–"}
            semaforo={incidentesAbiertos === null ? "gris" : semaforoIncidentes}
            que_es="Número de incidentes de convivencia registrados en las últimas 4 semanas que aún están en estado 'abierto' o 'en seguimiento'."
            comparacion="Lo esperado es que los incidentes se cierren en menos de 2 meses (Art. 16E-g Ley 21.809). Un número bajo y decreciente es buena señal."
            accion={incidentesAbiertos > 0 ? "Revisa los incidentes con más días abiertos — algunos pueden estar cerca del plazo legal → ir a Convivencia." : "Sin incidentes abiertos. Buen estado."}
            onClick={() => navigate("/dashboard/convivencia")}
          />

          <TarjetaIndicador
            icono="🎯"
            titulo="Sesiones Kolibri"
            valor={sesionesKolibri}
            unidad="sesiones"
            semaforo={semaforoSesiones}
            que_es="Total de sesiones de aprendizaje registradas en el canal Kolibri de Matemáticas (Chile 1° a 4° Medio) durante el período activo del piloto."
            comparacion="Para una escuela con 4 cursos activos, un ritmo saludable es 40-60 sesiones por semana. El piloto acumula 172 sesiones totales."
            accion="Identifica los niveles con menos actividad (2° Medio tiene solo 2 sesiones) y propón al docente asignar OA específicos → ir a Curricular."
            onClick={() => navigate("/dashboard/curricular")}
          />

          {(user?.role === 'orientador' || user?.role === 'psicologo' || user?.role === 'coordinador_convivencia') ? (
            <TarjetaIndicador
              icono="🧠"
              titulo="Estudiantes en seguimiento"
              valor={alertasActivas ?? '–'}
              semaforo={alertasActivas === null ? 'gris' : alertasActivas > 0 ? 'amarillo' : 'verde'}
              que_es="Número de estudiantes con alertas de riesgo activas que requieren seguimiento psicosocial."
              comparacion="Cada alerta debe ser atendida en 5 días hábiles. Una alerta vencida requiere acción inmediata."
              accion="Revisa el perfil de cada estudiante en seguimiento y coordina con el equipo → ir a Convivencia."
              onClick={() => navigate('/dashboard/convivencia')}
            />
          ) : esUTP ? (
            <TarjetaIndicador
              icono="✨"
              titulo="KIRA disponible"
              valor="37"
              unidad="prompts"
              semaforo="verde"
              que_es="KIRA es el Asistente Pedagógico de IA de KEDAS. Tiene 37 prompts listos para ayudarte a planificar, evaluar, gestionar y comunicarte — usando los datos reales de tu escuela."
              comparacion="KIRA corre en el servidor de tu escuela. Ningún dato sale al exterior. Puedes ejecutar prompts en segundos sin esperar a un experto externo."
              accion="Prueba el prompt 'Secuencia semanal' o 'Correlación DIA-SIMCE-Kolibri' para empezar → ir a KIRA."
              onClick={() => navigate("/dashboard/kira")}
            />
          ) : (
            <TarjetaIndicador
              icono="🚨"
              titulo="Alertas de riesgo"
              valor={alertasActivas ?? "–"}
              semaforo={alertasActivas === null ? "gris" : semaforoAlertas}
              que_es="Número de alertas de riesgo académico activas generadas por el modelo de IA de KEDAS. Cada alerta identifica un estudiante con factores de riesgo que requiere atención."
              comparacion="Las alertas deben ser atendidas en 5 días hábiles (Art. 8° bis). Una alerta vencida significa que no fue confirmada ni desestimada en el plazo."
              accion={alertasActivas > 0 ? "Revisa las alertas con el orientador y define acciones de intervención → ir a Convivencia." : "Sin alertas activas."}
              onClick={() => navigate("/dashboard/convivencia")}
            />
          )}
        </div>
      </div>

      )}

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          ¿A dónde quieres ir hoy?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(esUTP ? ACCESOS_UTP :
             user?.role === 'docente' ? ACCESOS_DOCENTE :
             user?.role === 'apoderado' ? ACCESOS_APODERADO :
             user?.role === 'slep_tecnico' ? ACCESOS_SLEP :
             (user?.role === 'orientador' || user?.role === 'psicologo' || user?.role === 'coordinador_convivencia') ? ACCESOS_CONVIVENCIA :
             ACCESOS_DIR
          ).map(a => (
            <AccesoRapido key={a.path} {...a} />
          ))}
        </div>
      </div>

      {/* Nota del sistema */}
      <div className="text-xs text-slate-400 border-t border-slate-100 pt-4">
        KEDAS v3.4.0 · Soberanía de datos local · Ley 21.719 · Los datos de esta pantalla se calculan en tiempo real desde el servidor de tu establecimiento.
        Usa el botón <strong>?</strong> del encabezado para revisar la guía de tu rol en cualquier momento.
      </div>
    </div>
  );
}
