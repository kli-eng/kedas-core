// frontend/src/components/Estudiantes/Perfil360.jsx
// KEDAS v3.4.0 — S4-02 Perfil 360° del alumno
// Lista navegable + ficha del estudiante (asistencia + actividad en Kolibri)
// La ficha y la actividad de Kolibri se piden por separado: si una falla, la otra se muestra igual.
import { useEffect, useRef, useState } from "react";
import { listarEstudiantes, obtenerPerfil, obtenerProgreso } from "../../services/api.js";

// color según la categoría oficial del Mineduc (calculada con la TAC)
const ACENTO_CATEGORIA = { esperada: "green", reiterada: "yellow", grave: "red", critica: "red" };

const fmt = (n, dec = 1) =>
  Number(n).toLocaleString("es-CL", { maximumFractionDigits: dec });

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
  const [errorPerfil, setErrorPerfil] = useState(null);
  const [errorProgreso, setErrorProgreso] = useState(false);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ultimaSeleccion = useRef(null);

  useEffect(() => {
    listarEstudiantes()
      .then(setLista)
      .catch(() => setErrorLista("No se pudo cargar la lista de estudiantes."))
      .finally(() => setCargandoLista(false));
  }, []);

  const seleccionarEstudiante = async (hashId) => {
    if (hashId === hashSel) return;
    ultimaSeleccion.current = hashId;
    setHashSel(hashId); setPerfil(null); setProgreso(null);
    setErrorPerfil(null); setErrorProgreso(false);
    setCargandoPerfil(true);
    const [p, pr] = await Promise.allSettled([
      obtenerPerfil(hashId),
      obtenerProgreso(hashId, 30),
    ]);
    if (ultimaSeleccion.current !== hashId) return; // se eligió otro estudiante mientras cargaba
    if (p.status === "fulfilled") setPerfil(p.value);
    else setErrorPerfil("No se pudo cargar la ficha de este estudiante.");
    if (pr.status === "fulfilled") setProgreso(pr.value);
    else setErrorProgreso(true);
    setCargandoPerfil(false);
  };

  const listaFiltrada = lista.filter(e =>
    !busqueda || (e.nombre || "").toLowerCase().includes(busqueda.toLowerCase()) ||
    (e.curso || "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const sinActividad = progreso && !progreso.interacciones_total;

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

        {errorPerfil && !cargandoPerfil && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{errorPerfil}</p>
        )}

        {perfil && !cargandoPerfil && (
          <div className="space-y-5">
            {/* Encabezado */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-800">
                  {perfil.nombre_display || "Estudiante"}
                </h2>
                <p className="text-sm text-slate-400">{perfil.curso || ""}</p>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="Asistencia del año (TAC)"
                value={perfil.asistencia_tac != null ? `${fmt(perfil.asistencia_tac)} %` : "—"}
                sub={perfil.asistencia_tac == null
                  ? "Sin datos todavía"
                  : `${perfil.asistencia_categoria_etiqueta}${perfil.asistencia_tam != null ? ` · ${perfil.asistencia_mes}: ${fmt(perfil.asistencia_tam)} %` : ""}`}
                accent={ACENTO_CATEGORIA[perfil.asistencia_categoria] || "slate"}
              />
              <KpiCard
                label="Sesiones en Kolibri"
                value={progreso ? progreso.interacciones_total : "—"}
                sub={errorProgreso
                  ? "No se pudo cargar la actividad de Kolibri"
                  : sinActividad ? "Sin actividad registrada en los últimos 30 días" : "últimos 30 días"}
                accent="blue"
              />
              <KpiCard
                label="Tiempo en Kolibri"
                value={progreso && !sinActividad ? `${fmt(progreso.tiempo_total_horas)} h` : "—"}
                sub={progreso && !sinActividad
                  ? `${progreso.contenidos_completados} ${progreso.contenidos_completados === 1 ? "recurso completado" : "recursos completados"}`
                  : null}
                accent="blue"
              />
            </div>

            {/* Tipos de recurso usados en Kolibri */}
            {progreso && !sinActividad && (
              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Tipos de recurso usados en Kolibri (últimos 30 días)
                </h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "Videos", value: progreso.dua_ratio_video },
                    { label: "Ejercicios", value: progreso.dua_ratio_ejercicio },
                    { label: "Completados", value: progreso.dua_ratio_completacion },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">{label}</p>
                      <p className="text-lg font-bold text-slate-700">
                        {value != null ? `${Math.round(value * 100)} %` : "—"}
                      </p>
                      <p className="text-xs text-slate-400">de las sesiones</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
