// frontend/src/components/Dashboard/DashboardAdmin.jsx
// KEDAS v3.4.0 — Panel del administrador con tabs operativas.
// G-09 cerrada: gestión completa de usuarios desde el frontend.

import { useEffect, useState } from "react";
import { healthCheck } from "../../services/api.js";
import UsuariosCRUD from "../Admin/UsuariosCRUD.jsx";
import EstablecimientosCRUD from "../Admin/EstablecimientosCRUD.jsx";

export default function DashboardAdmin({ user }) {
  const [tab, setTab] = useState("usuarios");
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    healthCheck()
      .then(setHealth)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <header className="flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Administración del sistema
          </h1>
          <p className="text-sm text-slate-500">
            KEDAS v3.4.0 · {user.nombre_completo}
          </p>
        </div>
        {health && (
          <div className="text-right text-xs">
            <div>API: <span className="font-semibold text-green-700">{health.estado}</span></div>
            <div>Versión: <span className="font-semibold">{health.version}</span></div>
          </div>
        )}
        {error && <div className="text-red-700 text-xs">⚠ {error}</div>}
      </header>

      <nav className="flex gap-1 border-b border-slate-200">
        {[
          { id: "usuarios", label: "Usuarios" },
          { id: "establecimientos", label: "Establecimientos" },
          { id: "sistema", label: "Sistema" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.id
                ? "border-kedas-primary text-kedas-primary"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "usuarios" && (
        <div className="-mx-6">  {/* Compensa el padding outer para usar todo el ancho */}
          <UsuariosCRUD user={user} />
        </div>
      )}

      {tab === "establecimientos" && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-2">Establecimientos</h2>
          <p className="text-sm text-slate-600">
            La gestión de establecimientos se realiza vía migración SQL en esta versión.
            <EstablecimientosCRUD />
          </p>
        </section>
      )}

      {tab === "sistema" && (
        <section className="bg-white rounded-lg shadow p-6 space-y-3">
          <h2 className="text-lg font-semibold">Estado del sistema</h2>
          {health && (
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">Servicio API</dt>
                <dd className="font-semibold text-green-700">
                  {health.estado === "ok" ? "✓ Operativo" : "⚠ Revisar"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Versión</dt>
                <dd className="font-semibold">{health.version}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Sistema</dt>
                <dd className="font-semibold">{health.sistema}</dd>
              </div>
            </dl>
          )}
          <div className="pt-3 mt-3 border-t border-slate-200 text-xs text-slate-500">
            Bitácora de auditoría completa disponible en tabla
            <code className="mx-1 px-1 bg-slate-100 rounded">kedas_audit_log</code>
            — vista de administración próximamente en este panel (S5-20).
          </div>
        </section>
      )}
    </div>
  );
}
