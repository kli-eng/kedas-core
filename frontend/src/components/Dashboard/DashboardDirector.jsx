// frontend/src/components/Dashboard/DashboardDirector.jsx
// KEDAS v3.3.0 — Director ve KPIs institucionales
// NOTA (kedas-core, 15-jul-2026): panel de Convivencia y widgets de
// Inteligencia Curricular/KIRA/SITAN removidos aquí — dependen de módulos
// Premium (convivencia.py, curricular.py, ia.py). Ver DEC-41.

import { useEffect, useState } from "react";
import { getDashboardDirector } from "../../services/api.js";
import ModuloProximamente from "../Layout/ModuloProximamente.jsx";

export default function DashboardDirector({ user }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const estId = user.establecimiento_id || 3;

  useEffect(() => {
    getDashboardDirector(estId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [estId]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-slate-600">Cargando...</div>;
  if (error)   return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md"><strong>Error:</strong> {error}</div></div>;

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">
          {user.nombre_completo?.split(" ")[0] || "Director/a"}
        </h1>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString("es-CL",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
          {data?.nombre_establecimiento && <span> · <strong>{data.nombre_establecimiento}</strong></span>}
        </p>
      </header>

      {/* KPIs académicos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Estudiantes en riesgo" value={data?.total_estudiantes_con_riesgo} color="#1E40AF" />
        <Kpi label="Alertas pendientes"    value={data?.alertas_pendientes}           color={data?.alertas_pendientes > 0 ? "#D97706" : "#64748B"} />
        <Kpi label="Incidentes abiertos"   value={data?.incidentes_abiertos}          color={data?.incidentes_abiertos > 0 ? "#DC2626" : "#64748B"} />
        <Kpi label="Sesiones Kolibri"      value={data?.kolibri_sesiones?.total_sesiones} color="#7C3AED" />
      </div>

      {/* Actividad Kolibri resumida */}
      {data?.kolibri_sesiones && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-slate-700 mb-4">Actividad Kolibri · {data.kolibri_sesiones.canal_principal}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiConv label="Sesiones"          value={data.kolibri_sesiones.total_sesiones}     color="#1E40AF" />
            <KpiConv label="Usuarios activos"  value={data.kolibri_sesiones.usuarios_activos}   color="#7C3AED" />
            <KpiConv label="Completados"       value={data.kolibri_sesiones.recursos_completados} color="#16A34A" />
            <KpiConv label="Horas totales"     value={data.kolibri_sesiones.horas_totales}      color="#0891B2" />
          </div>
        </section>
      )}

      {/* Módulos Premium: Convivencia, KIRA, Inteligencia Curricular, SITAN */}
      <ModuloProximamente
        modulo="Módulos avanzados"
        nombre="Convivencia, KIRA, Inteligencia Curricular y SITAN"
        descripcion="Disponibles con licencia comercial KLI. Contacto: hola@kli.cl"
      />

    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 border-l-4" style={{ borderColor: color }}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value ?? "–"}</div>
    </div>
  );
}
function KpiConv({ label, value, color }) {
  return (
    <div className="text-center p-3 rounded-lg bg-slate-50">
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value ?? "–"}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
