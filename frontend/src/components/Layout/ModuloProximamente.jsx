// frontend/src/components/Layout/ModuloProximamente.jsx
// FE-01 — Placeholder para módulos DEC-30 sin pantalla propia todavía.

export default function ModuloProximamente({ modulo, nombre, descripcion }) {
  return (
    <div className="p-10 max-w-xl mx-auto text-center">
      <div className="text-4xl mb-3">🚧</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
        {modulo}
      </div>
      <h1 className="text-xl font-bold text-slate-800 mb-2">{nombre}</h1>
      <p className="text-sm text-slate-500 leading-relaxed">
        {descripcion || "Este módulo está en desarrollo y estará disponible próximamente en KEDAS."}
      </p>
    </div>
  );
}
