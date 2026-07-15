// frontend/src/components/Dashboard/DashboardUTP.jsx
// KEDAS v3.3.0 — UTP ve KPIs académicos + predicciones de riesgo

import { useEffect, useState } from "react";
import { getDashboardUTP, getKolibriOnline } from "../../services/api.js";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const COLORS = { alto:"#DC2626", moderado:"#D97706", bajo:"#16A34A", primary:"#1E40AF", secondary:"#7C3AED" };
const NIVEL_COLORS = ["#1E40AF","#7C3AED","#0891B2","#D97706","#16A34A","#DC2626"];

export default function DashboardUTP({ user }) {
  const [data, setData]       = useState(null);
  const [online, setOnline]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const estId = user.establecimiento_id || 3;

  useEffect(() => {
    getDashboardUTP(estId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    getKolibriOnline(estId)
      .then(setOnline)
      .catch(() => setOnline(null));
  }, [estId]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-slate-600">Cargando datos UTP...</div>;
  if (error)   return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md"><strong>Error:</strong> {error}</div></div>;

  const porNivel = data?.kolibri_sesiones?.por_nivel || [];
  const k1Data   = porNivel.map(n => ({ nivel: n.nivel?.replace("Básico","Bás.").replace("Medio","Med.") || "Sin nivel", Sesiones: n.sesiones || 0 }));
  const k2Data   = porNivel.map(n => ({ nivel: n.nivel?.replace("Básico","Bás.").replace("Medio","Med.") || "Sin nivel", Minutos: n.minutos || 0 }));
  const k4Data   = porNivel.filter(n => (n.completados||0) > 0).map((n,i) => ({ name: n.nivel||"Sin nivel", value: n.completados||0, fill: NIVEL_COLORS[i%NIVEL_COLORS.length] }));

  const riesgoData = [
    { name:"Alto",     value: data?.estudiantes_riesgo_alto,     fill: COLORS.alto },
    { name:"Moderado", value: data?.estudiantes_riesgo_moderado, fill: COLORS.moderado },
    { name:"Bajo",     value: data?.estudiantes_riesgo_bajo,     fill: COLORS.bajo },
  ].filter(d => d.value > 0);

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">
          Jefatura UTP — {user.nombre_completo?.split(" ")[0] || ""}
        </h1>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString("es-CL",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
          {data?.nombre_establecimiento && <span> · <strong>{data.nombre_establecimiento}</strong></span>}
        </p>
      </header>

      {/* KPIs institucionales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Estudiantes en riesgo"  value={data?.total_estudiantes_con_riesgo} color={COLORS.primary} />
        <Kpi label="Alertas pendientes"     value={data?.alertas_pendientes}           color={data?.alertas_pendientes > 0 ? "#D97706" : "#64748B"} />
        <Kpi label="Incidentes abiertos"    value={data?.incidentes_abiertos}          color={data?.incidentes_abiertos > 0 ? "#DC2626" : "#64748B"} />
        <Kpi label="Asistencia 30 días"     value={data?.asistencia_pct_30d != null ? `${data.asistencia_pct_30d}%` : "–"} color={COLORS.secondary} />
      </div>

      {/* KPIs Kolibri */}
      {data?.kolibri_sesiones && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiK label="Sesiones totales"     value={data.kolibri_sesiones.total_sesiones} />
          <KpiK label="Usuarios activos"     value={data.kolibri_sesiones.usuarios_activos} />
          <KpiK label="Recursos completados" value={data.kolibri_sesiones.recursos_completados} />
          <KpiK label="Horas totales"        value={data.kolibri_sesiones.horas_totales} />
        </div>
      )}

      {/* Predicciones — distribución de riesgo */}
      {riesgoData.length > 0 && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-slate-700 mb-2">Predicciones IA — Perfil de riesgo</h2>
          <p className="text-xs text-slate-400 mb-4">Distribución de estudiantes por nivel de riesgo (modelo ML local)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={riesgoData} cx="50%" cy="50%" outerRadius={75} dataKey="value" nameKey="name">
                  {riesgoData.map((e,i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col justify-center gap-3">
              {riesgoData.map(r => (
                <div key={r.name} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: r.fill + "15" }}>
                  <span className="text-sm font-medium" style={{ color: r.fill }}>Riesgo {r.name}</span>
                  <span className="text-xl font-bold tabular-nums" style={{ color: r.fill }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Gráficos Kolibri */}
      {k1Data.length > 0 && (
        <section className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Sesiones Kolibri por nivel</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={k1Data} margin={{top:4,right:16,left:0,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="nivel" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip />
              <Bar dataKey="Sesiones" fill={COLORS.primary} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {k2Data.length > 0 && (
        <section className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Tiempo de uso por nivel (minutos)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={k2Data} margin={{top:4,right:16,left:0,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="nivel" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip /><Legend />
              <Line type="monotone" dataKey="Minutos" stroke={COLORS.secondary} strokeWidth={2} dot={{r:4}} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* Tabla detalle por nivel */}
      {porNivel.length > 0 && (
        <section className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Detalle por nivel · {data?.kolibri_sesiones?.canal_principal}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-500 text-xs border-b">
                <th className="text-left py-2 px-3">Nivel</th>
                <th className="text-right py-2 px-3">Sesiones</th>
                <th className="text-right py-2 px-3">Tiempo (min)</th>
                <th className="text-right py-2 px-3">Completados</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {porNivel.map(n => (
                  <tr key={n.nivel}>
                    <td className="py-2 px-3 font-medium">{n.nivel}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{n.sesiones}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{n.minutos}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{n.completados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {/* MOD-04: Cobertura Curricular */}
      <section className="mt-6 px-6">
        <CoberturaOA user={user} />
      </section>
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
function KpiK({ label, value }) {
  return (
    <div className="bg-blue-50 rounded-lg px-3 py-2 text-center">
      <div className="text-2xl font-bold text-blue-700 tabular-nums">{value ?? "–"}</div>
      <div className="text-xs text-slate-600">{label}</div>
    </div>
  );
}
