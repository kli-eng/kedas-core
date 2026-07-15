// frontend/src/components/Dashboard/DashboardDocente.jsx
// Gráficos Sprint 2 — B1.2: K1 BarChart, K2 LineChart, K3 KPI, K4 PieChart

import { useEffect, useState } from "react";
import { getDashboardDocente, getKolibriOnline } from "../../services/api.js";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const COLORS = { alto:"#DC2626", moderado:"#D97706", bajo:"#16A34A", primary:"#1E40AF", secondary:"#7C3AED" };
const NIVEL_COLORS = ["#1E40AF","#7C3AED","#0891B2","#D97706","#16A34A","#DC2626"];

export default function DashboardDocente({ user }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [online, setOnline]   = useState(null);

  useEffect(() => {
  const estId = user.establecimiento_id || 3;
  getDashboardDocente(estId)
    .then(setData)
    .catch((e) => setError(e.message))
    .finally(() => setLoading(false));

  getKolibriOnline(estId)
    .then(setOnline)
    .catch(() => setOnline(null));
}, [user.establecimiento_id]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-slate-600">Cargando datos del establecimiento...</div>
    </div>
  );
  if (error) return (
    <div className="p-6">
      <div role="alert" className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
        <strong>Error:</strong> {error}
      </div>
    </div>
  );

  const porNivel = data?.kolibri_sesiones?.por_nivel || [];
  const k1Data = porNivel.map((n) => ({ nivel: n.nivel?.replace("Básico","Bás.").replace("Medio","Med.") || "Sin nivel", Sesiones: n.sesiones || 0 }));
  const k2Data = porNivel.map((n) => ({ nivel: n.nivel?.replace("Básico","Bás.").replace("Medio","Med.") || "Sin nivel", Minutos: n.minutos || 0 }));
  const k4Data = porNivel.filter((n) => (n.completados||0) > 0).map((n,i) => ({ name: n.nivel||"Sin nivel", value: n.completados||0, fill: NIVEL_COLORS[i%NIVEL_COLORS.length] }));
  const riesgoData = [
    { name:"Alto",     value: data?.estudiantes_riesgo_alto,     fill: COLORS.alto },
    { name:"Moderado", value: data?.estudiantes_riesgo_moderado, fill: COLORS.moderado },
    { name:"Bajo",     value: data?.estudiantes_riesgo_bajo,     fill: COLORS.bajo },
  ].filter((d) => d.value > 0);

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">
          {user.nombre_completo?.split(" ")[0] || "Docente"}
        </h1>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString("es-CL",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
          {data?.nombre_establecimiento && <span> · <strong>{data.nombre_establecimiento}</strong></span>}
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Estudiantes en riesgo"  value={data?.total_estudiantes_con_riesgo} accent="primary" />
        <Kpi label="Asistencia 30 días"     value={data?.asistencia_pct_30d != null ? `${data.asistencia_pct_30d}%` : "–"} accent="secondary" />
        <Kpi label="Alertas pendientes"     value={data?.alertas_pendientes} accent={data?.alertas_pendientes > 0 ? "warning" : "neutral"} />
        <Kpi label="Incidentes graves"      value={data?.incidentes_muy_graves} accent={data?.incidentes_muy_graves > 0 ? "danger" : "neutral"} />
      </div>

      {data?.kolibri_sesiones && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiKolibri label="Sesiones totales"      value={data.kolibri_sesiones.total_sesiones} />
          <KpiKolibri label="Usuarios activos"      value={data.kolibri_sesiones.usuarios_activos} />
          <KpiKolibri label="Recursos completados"  value={data.kolibri_sesiones.recursos_completados} />
          <KpiKolibri label="Horas totales"         value={data.kolibri_sesiones.horas_totales} />
        </div>
      )}

      {k1Data.length > 0 && (
        <section className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">K1 · Sesiones Kolibri por nivel</h2>
          <ResponsiveContainer width="100%" height={220}>
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
          <h2 className="text-sm font-semibold text-slate-700 mb-3">K2 · Tiempo de uso por nivel (minutos)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={k2Data} margin={{top:4,right:16,left:0,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="nivel" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip /><Legend />
              <Line type="monotone" dataKey="Minutos" stroke={COLORS.secondary} strokeWidth={2} dot={{r:4}} activeDot={{r:6}} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {k4Data.length > 0 && (
          <section className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">K4 · Recursos completados por nivel</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={k4Data} cx="50%" cy="50%" outerRadius={75} dataKey="value" nameKey="name">
                  {k4Data.map((e,i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </section>
        )}
        {riesgoData.length > 0 && (
          <section className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Distribución de perfil de riesgo</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={riesgoData} cx="50%" cy="50%" outerRadius={75} dataKey="value" nameKey="name">
                  {riesgoData.map((e,i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </section>
        )}
      </div>

      {data?.kolibri_sesiones?.por_nivel?.length > 0 && (
        <section className="bg-white rounded-lg shadow p-4">
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-slate-700">Actividad en Kolibri · {data.kolibri_sesiones.centro || "Establecimiento"}</h2>
            <p className="text-xs text-slate-500">Fuente: {data.kolibri_sesiones.fuente} · Canal: {data.kolibri_sesiones.canal_principal || "–"}</p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr>
                <th className="text-left py-2 px-3">Nivel</th>
                <th className="text-right py-2 px-3">Sesiones</th>
                <th className="text-right py-2 px-3">Tiempo (min)</th>
                <th className="text-right py-2 px-3">Completados</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.kolibri_sesiones.por_nivel.map((n) => (
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
      {online && (
        <section className="bg-white rounded-lg shadow p-4 border-l-4 border-kedas-secondary">
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-slate-700">
              Piloto completo · {online.periodo_piloto === "nov-2025" ? "Noviembre 2025" : online.periodo_piloto}
            </h2>
            <p className="text-xs text-slate-500">
              Resultado del piloto realizado — no datos en tiempo real activo
            </p>
          </header>
 
          <div className="flex items-center justify-center mb-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-kedas-secondary tabular-nums">
                {(data?.kolibri_sesiones?.total_sesiones || 0) + online.sesiones_totales}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                Sesiones totales del piloto (offline + online)
              </div>
            </div>
          </div>
 
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <KpiKolibri label="Offline (en vivo)" value={data?.kolibri_sesiones?.total_sesiones ?? "–"} />
            <KpiKolibri label="Online (histórico)" value={online.sesiones_totales} />
            <KpiKolibri label="Usuarios únicos (online)" value={online.usuarios_unicos} />
            <KpiKolibri label="Tasa completitud (online)" value={`${online.tasa_completitud}%`} />
          </div>
 
          {online.por_asignatura?.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead><tr>
                  <th className="text-left py-2 px-3">Asignatura (online)</th>
                  <th className="text-right py-2 px-3">Sesiones</th>
                  <th className="text-right py-2 px-3">Tiempo (min)</th>
                  <th className="text-right py-2 px-3">Completados</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {online.por_asignatura.map((a) => (
                    <tr key={a.asignatura}>
                      <td className="py-2 px-3 font-medium">{a.asignatura}</td>
                      <td className="text-right py-2 px-3 tabular-nums">{a.sesiones}</td>
                      <td className="text-right py-2 px-3 tabular-nums">{a.tiempo_minutos}</td>
                      <td className="text-right py-2 px-3 tabular-nums">{a.recursos_completados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
 
          {online.top_recursos?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Recursos más visitados (online)
              </h3>
              <ul className="text-sm text-slate-700 space-y-1">
                {online.top_recursos.map((r) => (
                  <li key={r.titulo} className="flex justify-between">
                    <span className="truncate pr-2">{r.titulo}</span>
                    <span className="text-slate-500 tabular-nums shrink-0">{r.sesiones} sesiones</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, accent="primary", subtitle }) {
  const accents = { primary:"border-kedas-primary", secondary:"border-kedas-secondary", warning:"border-amber-500", danger:"border-red-600", neutral:"border-slate-300" };
  return (
    <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${accents[accent]}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value ?? "–"}</div>
      {subtitle && <div className="text-xs text-red-700 mt-1">{subtitle}</div>}
    </div>
  );
}

function KpiKolibri({ label, value }) {
  return (
    <div className="bg-blue-50 rounded-lg px-3 py-2 text-center">
      <div className="text-2xl font-bold text-kedas-primary tabular-nums">{value ?? "–"}</div>
      <div className="text-xs text-slate-600">{label}</div>
    </div>
  );
}
