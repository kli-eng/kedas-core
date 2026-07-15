// frontend/src/components/Estudiantes/Perfil360.jsx
// KEDAS v3.3.0 — S4-02 Perfil 360° del alumno
// Lista navegable + detalle consolidado (riesgo + asistencia + Kolibri + alertas)
import { useEffect, useState } from "react";
import { listarEstudiantes, obtenerPerfil, obtenerProgreso } from "../../services/api.js";

const RIESGO_BADGE = {
  Alto:     "bg-red-100 text-red-700",
  Moderado: "bg-yellow-100 text-yellow-700",
  Bajo:     "bg-green-100 text-green-700",
};
const RIESGO_BAR = {
  Alto:     "bg-red-400",
  Moderado: "bg-yellow-400",
  Bajo:     "bg-green-400",
};
const SEMAFORO = {
  verde:    { color: "bg-green-400", label: "Normal" },
  amarillo: { color: "bg-yellow-400", label: "Atención" },
  rojo:     { color: "bg-red-400", label: "Crítico" },
};

function KpiCard({ label, value, sub, accent }) {
  const colors = {
    red:    "border-red-200 bg-red-50",
    yellow: "border-yellow-200 bg-yellow-50",
    green:  "border-green-200 bg-green-50",
    blue:   "border-blue-200 bg-blue-50",
    slate:  "border-slate-200 bg-slate-50",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[accent] || colors.slate}`}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value ?? "—"}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Perfil360({ user }) {
  const [lista, setLista] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [errorLista, setErrorLista] = useState(null);
  const [hashSel, setHashSel] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [progreso, setProgreso] = useState(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    listarEstudiantes()
      .then(setLista)
      .catch(() => setErrorLista("No se pudo cargar la lista de estudiantes."))
      .finally(() => setCargandoLista(false));
  }, []);

  const seleccionarEstudiante = async (hashId) => {
    if (hashId === hashSel) return;
    setHashSel(hashId); setPerfil(null); setProgreso(null);
    setCargandoPerfil(true);
    try {
      const [p, pr] = await Promise.all([
        obtenerPerfil(hashId),
        obtenerProgreso(hashId, 30),
      ]);
      setPerfil(p); setProgreso(pr);
    } catch {
      setPerfil(null);
    } finally {
      setCargandoPerfil(false);
    }
  };

  const listaFiltrada = lista.filter(e =>
    !busqueda || (e.nombre || "").toLowerCase().includes(busqueda.toLowerCase()) ||
    (e.curso || "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const estudianteSel = lista.find(e => e.hash_id === hashSel);

  return (
    <div className="flex h-full gap-4 p-4 max-w-6xl mx-auto">

      {/* ── Panel izquierdo: lista ── */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Estudiantes</h1>
          <p className="text-xs text-slate-400">Selecciona para ver perfil 360°</p>
        </div>
        <input
          type="text" value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o curso…"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        {cargandoLista && (
          <p className="text-sm text-slate-400 text-center py-8">Cargando…</p>
        )}
        {errorLista && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{errorLista}</p>
        )}

        <div className="flex flex-col gap-1 overflow-y-auto">
          {listaFiltrada.map(e => (
            <button key={e.hash_id}
              onClick={() => seleccionarEstudiante(e.hash_id)}
              className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                e.hash_id === hashSel
                  ? "border-blue-400 bg-blue-50"
                  : "border-transparent hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {e.nombre || e.hash_id.slice(0, 12) + "…"}
                  </p>
                  <p className="text-xs text-slate-400">{e.curso || "Sin curso"}</p>
                </div>
                {e.risk_level && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${RIESGO_BADGE[e.risk_level] || "bg-slate-100 text-slate-600"}`}>
                    {e.risk_level}
                  </span>
                )}
              </div>
            </button>
          ))}
          {!cargandoLista && listaFiltrada.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">Sin resultados</p>
          )}
        </div>
      </div>

      {/* ── Panel derecho: perfil 360° ── */}
      <div className="flex-1 min-w-0">
        {!hashSel && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <p className="text-4xl mb-3">👤</p>
            <p className="text-sm">Selecciona un estudiante para ver su perfil completo</p>
          </div>
        )}

        {cargandoPerfil && (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <p className="text-sm">Cargando perfil…</p>
          </div>
        )}

        {perfil && !cargandoPerfil && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-800">
                  {perfil.nombre_display || "Estudiante"}
                </h2>
                <p className="text-sm text-slate-400">{perfil.curso || ""}</p>
              </div>
              {perfil.risk_level && (
                <span className={`text-sm px-3 py-1 rounded-full font-semibold ${RIESGO_BADGE[perfil.risk_level]}`}>
                  Riesgo {perfil.risk_level}
                </span>
              )}
            </div>

            {/* Barra de riesgo */}
            {perfil.riesgo_score != null && (
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Índice de riesgo</span>
                  <span>{Math.round(perfil.riesgo_score * 100)}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${RIESGO_BAR[perfil.risk_level] || "bg-slate-400"}`}
                    style={{ width: `${Math.round(perfil.riesgo_score * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="Asistencia 30d"
                value={perfil.asistencia_pct != null ? `${perfil.asistencia_pct}%` : "—"}
                sub={perfil.semaforo_asistencia ? SEMAFORO[perfil.semaforo_asistencia]?.label : null}
                accent={perfil.semaforo_asistencia === "rojo" ? "red" : perfil.semaforo_asistencia === "amarillo" ? "yellow" : "green"}
              />
              <KpiCard
                label="Alertas activas"
                value={perfil.incidentes_activos ?? 0}
                accent={perfil.incidentes_activos > 0 ? "red" : "slate"}
              />
              <KpiCard
                label="Interacciones"
                value={progreso?.interacciones_total ?? "—"}
                sub="últimos 30 días"
                accent="blue"
              />
              <KpiCard
                label="Tiempo Kolibri"
                value={progreso?.tiempo_total_horas != null ? `${progreso.tiempo_total_horas}h` : "—"}
                sub={progreso?.contenidos_completados != null ? `${progreso.contenidos_completados} completados` : null}
                accent="blue"
              />
            </div>

            {/* Factores de riesgo SHAP */}
            {perfil.factores_riesgo?.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Factores que influyen en el riesgo
                </h3>
                <div className="space-y-2">
                  {perfil.factores_riesgo.map((f, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                        <span>{f.factor}</span>
                        <span className={f.direccion === "aumenta riesgo" ? "text-red-600" : "text-green-600"}>
                          {f.direccion === "aumenta riesgo" ? "↑" : "↓"} {f.direccion}
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${f.direccion === "aumenta riesgo" ? "bg-red-400" : "bg-green-400"}`}
                          style={{ width: `${Math.min(100, Math.abs(f.importancia) * 200)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Perfil DUA */}
            {progreso && (
              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Perfil de aprendizaje (DUA)</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "Video", value: progreso.dua_ratio_video },
                    { label: "Ejercicios", value: progreso.dua_ratio_ejercicio },
                    { label: "Completación", value: progreso.dua_ratio_completacion },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">{label}</p>
                      <p className="text-lg font-bold text-slate-700">
                        {value != null ? `${Math.round(value * 100)}%` : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Aviso sin consentimiento */}
            {!perfil.consentimiento_predictivo && (
              <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-lg">
                ℹ️ El apoderado no ha otorgado consentimiento predictivo (Capa 2).
                Los índices de riesgo y factores SHAP no están disponibles.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
