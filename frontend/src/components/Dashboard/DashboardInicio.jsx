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
import UsoKedas from "./UsoKedas.jsx";
import { getDashboardUTP, getDashboardDirector } from "../../services/api.js";

// ── Componente: tarjeta de indicador con contexto pedagógico ──
function TarjetaIndicador({ icono, titulo, valor, unidad, semaforo, que_es, comparacion, accion, onClick }) {
  const [mostrarContexto, setMostrarContexto] = useState(false);

  const colores = {
    verde:   { bg: "bg-green-50",  border: "border-green-300",  texto: "text-green-700",  dot: "🟢" },
    amarillo:{ bg: "bg-amber-50",  border: "border-amber-300",  texto: "text-amber-700",  dot: "🟡" },
    rojo:    { bg: "bg-red-50",    border: "border-red-300",    texto: "text-red-700",    dot: "🔴" },
    gris:    { bg: "bg-slate-50",  border: "border-slate-200",  texto: "text-slate-500",  dot: "⚪" },
    neutro:  { bg: "bg-white",     border: "border-slate-200",  texto: "text-slate-700",  dot: "ℹ️" },
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
        {cfg.dot} {semaforo === "verde" ? "Buen estado" : semaforo === "amarillo" ? "Requiere atención" : semaforo === "rojo" ? "Acción urgente" : semaforo === "neutro" ? "Dato informativo" : "Sin datos todavía"}
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

// Portada del administrador: solo lo que existe en su menú (roles.js).
const ACCESOS_ADMIN = [
  { icono: "👥", label: "Usuarios", desc: "Gestión de cuentas y roles", path: "/dashboard/usuarios", color: "border-blue-200 bg-blue-50" },
  { icono: "⚙️", label: "Sistema", desc: "Configuración y administración del sistema", path: "/dashboard/sistema", color: "border-slate-200 bg-slate-50" },
];

const ROLES_CONVIVENCIA = ["orientador", "psicologo", "coordinador_convivencia"];

// Indicadores de la plataforma base (Core): solo los que entrega
// /dashboard/{director|utp}/{id}. Sin datos se muestra "–" y "Sin datos
// todavía": nunca una cifra de ejemplo ni de otra instalación.
export default function DashboardInicio({ user }) {
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const esUTP = user?.role === "utp";
  const estId = user?.establecimiento_id ?? null;
  const conIndicadores = (user?.role === "director" || esUTP) && estId !== null;

  useEffect(() => {
    if (!conIndicadores) { setLoading(false); return; }
    const fetchDatos = esUTP ? getDashboardUTP(estId) : getDashboardDirector(estId);
    fetchDatos
      .then(setDatos)
      .catch(() => setDatos(null))
      .finally(() => setLoading(false));
  }, [estId, esUTP, conIndicadores]);

  const nombreRol = esUTP ? "Jefatura UTP" : "Dirección";
  const nombre = user?.nombre_completo?.split(" ")[0] || nombreRol;
  const establecimiento = datos?.nombre_establecimiento || "Establecimiento";
  const hoy = new Date().toLocaleDateString("es-CL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const asistencia = datos?.asistencia_pct_30d ?? null;
  const cursosEnRojo = datos?.asistencia_semaforo_rojo ?? null;
  const sesionesKolibri = datos?.kolibri_sesiones?.total_sesiones ?? null;

  // categorías oficiales del Mineduc, calculadas en el servidor con la TAC
  const asistTAC = datos?.asistencia_tac ?? null;
  const asistTAM = datos?.asistencia_tam ?? null;
  const asistMes = datos?.asistencia_mes ?? null;
  const asistCat = datos?.asistencia_categorias ?? null;
  const semaforoAsistencia = asistTAC === null ? "gris" : asistTAC >= 90 ? "verde" : asistTAC >= 85 ? "amarillo" : "rojo";

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
          Hola, {nombre} 👋
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {hoy}{conIndicadores && <> · <strong>{establecimiento}</strong></>}
        </p>
        <p className="text-sm text-slate-600 mt-3 max-w-2xl">
          {esUTP
            ? "Este es tu panel de inicio. Aquí ves los indicadores disponibles de tu establecimiento. Haz clic en ⓘ para entender cada uno."
            : user?.role === "director"
            ? "Este es tu panel de dirección. Aquí ves los indicadores disponibles de tu establecimiento. Haz clic en ⓘ para entender cada uno."
            : user?.role === "docente"
            ? "Este es tu panel docente. Desde aquí puedes ver el perfil de tus estudiantes y explorar recursos educativos abiertos."
            : user?.role === "admin"
            ? "Este es tu panel de administración del sistema: gestión de usuarios y configuración. No incluye indicadores pedagógicos."
            : "Bienvenido/a a KEDAS."
          }
        </p>
      </div>

      {/* Indicadores — solo dirección y UTP */}
      {conIndicadores && (
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Estado actual del establecimiento
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TarjetaIndicador
            icono="🗓️"
            titulo="Asistencia del año (TAC)"
            valor={asistTAC !== null ? `${asistTAC}%` : "–"}
            semaforo={semaforoAsistencia}
            que_es="Tasa de asistencia acumulada del año: días asistidos (presente o con atraso) sobre días con registro, según los datos de asistencia cargados en KEDAS. Las ausencias justificadas cuentan como inasistencia, igual que en la tasa del Mineduc."
            comparacion="Categorías del Mineduc (Centro de Estudios, Apuntes 109): asistencia esperada 90 % o más; inasistencia reiterada 85 % a menos de 90 %; grave 50 % a menos de 85 %; crítica menos de 50 %. La asistencia suele bajar en mayo y junio."
            accion={asistTAC === null
              ? "Aún no hay registros de asistencia cargados para este establecimiento."
              : `${(asistCat?.grave ?? 0) + (asistCat?.critica ?? 0)} estudiante(s) con inasistencia grave o crítica y ${asistCat?.reiterada ?? 0} con inasistencia reiterada${asistTAM !== null ? `. En ${asistMes}: ${asistTAM}%` : ""}. Revisa los casos con sus profesores jefes.`}
          />
          <TarjetaIndicador
            icono="🎯"
            titulo="Sesiones Kolibri"
            valor={sesionesKolibri ?? "–"}
            unidad={sesionesKolibri !== null ? "sesiones" : ""}
            semaforo={sesionesKolibri === null ? "gris" : "neutro"}
            que_es="Total de sesiones de aprendizaje en los registros de Kolibri exportados para este establecimiento."
            comparacion="Es un conteo de uso, no una medida de aprendizaje. Compáralo con el mismo dato de semanas anteriores."
            accion={sesionesKolibri === null
              ? "Aún no hay registros de Kolibri para este establecimiento."
              : "Revisa en el catálogo REA qué recursos tienes disponibles para los niveles con menos actividad."}
            onClick={sesionesKolibri !== null ? () => navigate("/dashboard/rea") : undefined}
          />
        </div>
      </div>
      )}

      {/* Lo que KEDAS entregó y pidió digitar — dirección y UTP */}
      {(user?.role === "director" || user?.role === "utp") && estId !== null && <UsoKedas estId={estId} />}

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          ¿A dónde quieres ir hoy?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(esUTP ? ACCESOS_UTP :
             user?.role === "docente" ? ACCESOS_DOCENTE :
             user?.role === "apoderado" ? ACCESOS_APODERADO :
             user?.role === "slep_tecnico" ? ACCESOS_SLEP :
             ROLES_CONVIVENCIA.includes(user?.role) ? ACCESOS_CONVIVENCIA :
             user?.role === "admin" ? ACCESOS_ADMIN :
             ACCESOS_DIR
          ).map(a => (
            <AccesoRapido key={a.path} {...a} />
          ))}
        </div>
      </div>

      {/* Nota del sistema */}
      <div className="text-xs text-slate-400 border-t border-slate-100 pt-4">
        KEDAS v3.4.0 · Diseñado para instalación local · Se alinea con la Ley 21.719 · Los datos de esta pantalla se calculan al abrirla, desde el servidor donde está instalado KEDAS.
        Usa el botón <strong>?</strong> del encabezado para revisar la guía de tu rol en cualquier momento.
      </div>
    </div>
  );
}
