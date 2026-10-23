// frontend/src/components/Dashboard/UsoKedas.jsx
// «Lo que KEDAS entregó este mes»: conteos de la bitácora para la dirección y la UTP.
// Muestra también lo que KEDAS pidió digitar, para ver el balance. No mide tiempo.
import { useEffect, useState } from "react";
import { getUso } from "../../services/api.js";

function Cifra({ etiqueta, mes, anio, ayuda }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col gap-1">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{etiqueta}</div>
      <div className="text-2xl font-bold tabular-nums text-slate-800">
        {mes ?? "–"}<span className="text-xs font-normal text-slate-500 ml-1">este mes</span>
      </div>
      <div className="text-xs text-slate-500">{anio ?? "–"} en el año</div>
      <div className="text-xs text-slate-400">{ayuda}</div>
    </div>
  );
}

export default function UsoKedas({ estId }) {
  const [uso, setUso] = useState(null);
  const [estado, setEstado] = useState("cargando");

  useEffect(() => {
    if (estId === null || estId === undefined) return;
    getUso(estId)
      .then(d => { setUso(d); setEstado("ok"); })
      .catch(() => setEstado("error"));
  }, [estId]);

  if (estado === "cargando") return null;

  const m = uso?.este_mes || {};
  const a = uso?.este_anio || {};
  const sinDatos = estado === "error" ||
    [a.reportes_entregados, a.avisos_apoderados, a.registros_digitados].every(v => !v);

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">
        Lo que KEDAS entregó este mes
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        Y lo que pidió digitar, para que veas el balance{uso?.mes ? ` · ${uso.mes}` : ""}.
      </p>
      {sinDatos ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Sin datos todavía.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Cifra etiqueta="Reportes entregados" mes={m.reportes_entregados} anio={a.reportes_entregados}
                   ayuda="Reportes y exportaciones descargados desde KEDAS." />
            <Cifra etiqueta="Avisos a apoderados" mes={m.avisos_apoderados} anio={a.avisos_apoderados}
                   ayuda="Correos enviados por KEDAS." />
            <Cifra etiqueta="Registros digitados" mes={m.registros_digitados} anio={a.registros_digitados}
                   ayuda="Lo que el equipo escribió en KEDAS: incidentes, medidas, cambios de estado y revisión de alertas." />
          </div>
          {a.datos_reutilizados !== null && a.datos_reutilizados !== undefined && (
            <p className="text-xs text-slate-600 mt-3">
              Registros que los reportes tomaron de KEDAS sin volver a digitarlos:{" "}
              <strong>{m.datos_reutilizados ?? 0}</strong> este mes · <strong>{a.datos_reutilizados}</strong> en el año.
            </p>
          )}
        </>
      )}
      <p className="text-xs text-slate-500 mt-3 italic">
        {uso?.nota_tiempo || "El tiempo ahorrado se mostrará cuando haya mediciones con colegios."}
      </p>
      {uso?.como_se_cuenta && (
        <details className="text-xs text-slate-500 mt-1">
          <summary className="cursor-pointer">¿Cómo se cuenta?</summary>
          <p className="mt-1">{uso.como_se_cuenta}</p>
        </details>
      )}
    </div>
  );
}
