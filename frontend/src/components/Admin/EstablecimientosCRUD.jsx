// frontend/src/components/Admin/EstablecimientosCRUD.jsx
// KEDAS v3.2.0 — PEND-03: CRUD establecimientos vía UI admin

import { useEffect, useState } from "react";
import {
  listarEstablecimientos,
  crearEstablecimiento,
  actualizarEstablecimiento,
} from "../../services/api.js";

// ── Constantes ────────────────────────────────────────────────────────────
const TIPO_OPTS = [
  { value: "urbano", label: "Urbano" },
  { value: "rural",  label: "Rural"  },
];

const FORM_EMPTY = {
  codigo_rbd:        "",
  nombre:            "",
  region:            "",
  tipo_contexto:     "urbano",
  ive_institucional: "",
  slep_id:           "",
};

// ── Modal crear/editar ────────────────────────────────────────────────────
function EstablecimientoModal({ estab, onClose, onSave }) {
  const esEdicion = !!estab;
  const [form, setForm]     = useState(esEdicion ? {
    codigo_rbd:        estab.codigo_rbd,
    nombre:            estab.nombre,
    region:            estab.region,
    tipo_contexto:     estab.tipo_contexto,
    ive_institucional: estab.ive_institucional ?? "",
    slep_id:           estab.slep_id ?? "",
  } : FORM_EMPTY);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.codigo_rbd.trim()) { setError("El RBD es obligatorio."); return; }
    if (!form.nombre.trim())     { setError("El nombre es obligatorio."); return; }
    if (!form.region.trim())     { setError("La región es obligatoria."); return; }

    setSaving(true); setError(null);
    const payload = {
      ...form,
      ive_institucional: form.ive_institucional !== "" ? parseFloat(form.ive_institucional) : null,
      slep_id:           form.slep_id !== "" ? parseInt(form.slep_id) : null,
    };
    // En edición no se envía codigo_rbd (es UNIQUE inmutable)
    if (esEdicion) delete payload.codigo_rbd;

    try {
      await onSave(payload);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 z-10"
           onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">
            {esEdicion ? "Editar establecimiento" : "Nuevo establecimiento"}
          </h2>
          <button onClick={onClose}
                  className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200
                          rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* RBD — solo en creación */}
          {!esEdicion && (
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                RBD <span className="text-red-500">*</span>
              </label>
              <input value={form.codigo_rbd}
                     onChange={e => set("codigo_rbd", e.target.value)}
                     className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                                focus:outline-none focus:ring-2 focus:ring-kedas-primary/30"
                     placeholder="Ej: 1490" />
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input value={form.nombre}
                   onChange={e => set("nombre", e.target.value)}
                   className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                              focus:outline-none focus:ring-2 focus:ring-kedas-primary/30"
                   placeholder="Ej: Escuela Quebrada de Alvarado" />
          </div>

          {/* Región */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">
              Región <span className="text-red-500">*</span>
            </label>
            <input value={form.region}
                   onChange={e => set("region", e.target.value)}
                   className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                              focus:outline-none focus:ring-2 focus:ring-kedas-primary/30"
                   placeholder="Ej: Valparaíso" />
          </div>

          {/* Tipo contexto + IVE */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Tipo</label>
              <select value={form.tipo_contexto}
                      onChange={e => set("tipo_contexto", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-kedas-primary/30 bg-white">
                {TIPO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                IVE <span className="text-slate-400">(0–100)</span>
              </label>
              <input type="number" min="0" max="100" step="0.01"
                     value={form.ive_institucional}
                     onChange={e => set("ive_institucional", e.target.value)}
                     className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                                focus:outline-none focus:ring-2 focus:ring-kedas-primary/30"
                     placeholder="Ej: 72.5" />
            </div>
          </div>

          {/* SLEP ID */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">
              SLEP ID <span className="text-slate-400">(opcional)</span>
            </label>
            <input type="number" min="1"
                   value={form.slep_id}
                   onChange={e => set("slep_id", e.target.value)}
                   className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                              focus:outline-none focus:ring-2 focus:ring-kedas-primary/30"
                   placeholder="ID del SLEP en la tabla kedas_slep" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-kedas-primary
                             hover:bg-kedas-primary/90 rounded-lg transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear establecimiento"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────
export default function EstablecimientosCRUD({ user }) {
  const [establecimientos, setEstablecimientos] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing,  setEditing]  = useState(null);   // null = crear, obj = editar
  const [toast,    setToast]    = useState(null);

  const notify = (msg, tipo = "info") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  const cargar = async () => {
    setLoading(true);
    try {
      const data = await listarEstablecimientos();
      setEstablecimientos(data || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const handleSave = async (formData) => {
    if (editing) {
      await actualizarEstablecimiento(editing.id, formData);
      notify(`${formData.nombre || editing.nombre} actualizado`, "success");
    } else {
      await crearEstablecimiento(formData);
      notify(`Establecimiento ${formData.nombre} creado`, "success");
    }
    setShowModal(false);
    setEditing(null);
    await cargar();
  };

  const abrirCrear = () => { setEditing(null); setShowModal(true); };
  const abrirEditar = (e) => { setEditing(e); setShowModal(true); };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm
                         font-medium text-white transition-all
                         ${toast.tipo === "success" ? "bg-green-600" :
                           toast.tipo === "error"   ? "bg-red-600"   : "bg-slate-700"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Establecimientos</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {establecimientos.length} establecimiento{establecimientos.length !== 1 ? "s" : ""} registrado{establecimientos.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={abrirCrear}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                           text-white bg-kedas-primary hover:bg-kedas-primary/90
                           rounded-lg transition-colors shadow-sm">
          + Nuevo
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-10 text-slate-400 text-sm">Cargando…</div>
      ) : establecimientos.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          No hay establecimientos registrados.
          <button onClick={abrirCrear} className="ml-1 text-kedas-primary hover:underline">
            Crear el primero →
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5">RBD</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5">Nombre</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5">Región</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5">Tipo</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-2.5">IVE</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-2.5">SLEP</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {establecimientos.map(e => (
                <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{e.codigo_rbd}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate">
                    {e.nombre}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{e.region}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                                      ${e.tipo_contexto === "urbano"
                                        ? "bg-blue-50 text-blue-700"
                                        : "bg-green-50 text-green-700"}`}>
                      {e.tipo_contexto}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {e.ive_institucional != null ? `${e.ive_institucional}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                    {e.slep_id ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => abrirEditar(e)}
                            className="text-xs text-kedas-primary hover:underline font-medium">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <EstablecimientoModal
          estab={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
