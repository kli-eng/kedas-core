// frontend/src/components/Admin/UsuariosCRUD.jsx
// KEDAS v3.1.0 — UI completa de gestión de usuarios (G-09)
import { useEffect, useState } from "react";
import {
  listarUsuarios, crearUsuario, actualizarUsuario,
  desactivarUsuario, resetPassword, listarEstablecimientos,
} from "../../services/api.js";
import { NOMBRE_ROL, ROLES } from "../../utils/roles.js";

export default function UsuariosCRUD({ user }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [toast, setToast] = useState(null);

  async function cargar() {
    setLoading(true);
    try {
      const data = await listarUsuarios({ incluir_inactivos: false });
      setUsuarios(data || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function notify(msg, tipo = "info") {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 5000);
  }

  async function handleSave(formData) {
    try {
      if (editingUser) {
        await actualizarUsuario(editingUser.id, formData);
        notify("Usuario actualizado", "success");
      } else {
        await crearUsuario(formData);
        notify("Usuario creado", "success");
      }
      setShowModal(false);
      setEditingUser(null);
      await cargar();
    } catch (e) {
      notify(e.message, "error");
    }
  }

  async function handleDesactivar(u) {
    if (!confirm(`¿Desactivar a ${u.username}? Podrá ser reactivado luego.`)) return;
    try {
      await desactivarUsuario(u.id);
      notify(`${u.username} desactivado`, "success");
      await cargar();
    } catch (e) {
      notify(e.message, "error");
    }
  }

  async function handleResetPwd(u) {
    if (!confirm(`Generar nueva contraseña temporal para ${u.username}?`)) return;
    try {
      const result = await resetPassword(u.id);
      // CRÍTICO: mostrar UNA SOLA vez. No queda guardada.
      alert(
        `Contraseña temporal para ${result.username}:\n\n` +
        `${result.password_temporal}\n\n` +
        `${result.aviso}\n\n` +
        `Cópiala AHORA — no volverá a mostrarse.`
      );
    } catch (e) {
      notify(e.message, "error");
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestión de usuarios</h1>
          <p className="text-sm text-slate-500">
            Crear, actualizar y desactivar accesos al sistema
          </p>
        </div>
        <button
          onClick={() => { setEditingUser(null); setShowModal(true); }}
          className="bg-kedas-primary hover:bg-blue-800 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          + Crear usuario
        </button>
      </header>

      {toast && (
        <div
          role="status"
          className={`px-4 py-2 rounded-md text-sm ${
            toast.tipo === "success" ? "bg-green-50 text-green-800 border border-green-200" :
            toast.tipo === "error"   ? "bg-red-50 text-red-700 border border-red-200" :
                                       "bg-blue-50 text-blue-700 border border-blue-200"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        {loading && <p className="p-4 text-slate-500">Cargando...</p>}
        {error && (
          <div role="alert" className="p-4 bg-red-50 text-red-700">
            {error}
          </div>
        )}
        {!loading && !error && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left py-2 px-3">Usuario</th>
                <th className="text-left py-2 px-3">Nombre</th>
                <th className="text-left py-2 px-3">Rol</th>
                <th className="text-left py-2 px-3">Email</th>
                <th className="text-left py-2 px-3">Estab.</th>
                <th className="text-left py-2 px-3">Último login</th>
                <th className="text-right py-2 px-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usuarios.length === 0 && (
                <tr><td colSpan="7" className="text-center py-6 text-slate-500">
                  No hay usuarios. Crea el primero con el botón arriba.
                </td></tr>
              )}
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 px-3 font-mono text-xs">{u.username}</td>
                  <td className="py-2 px-3">{u.nombre_completo}</td>
                  <td className="py-2 px-3">
                    <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-800 rounded-full text-xs">
                      {NOMBRE_ROL[u.role] || u.role}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-600 text-xs">{u.email || "—"}</td>
                  <td className="py-2 px-3 text-center">{u.establecimiento_id || "—"}</td>
                  <td className="py-2 px-3 text-xs text-slate-500">
                    {u.ultimo_login
                      ? new Date(u.ultimo_login).toLocaleString("es-CL")
                      : "Nunca"}
                  </td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button
                      onClick={() => { setEditingUser(u); setShowModal(true); }}
                      className="text-xs text-kedas-primary hover:underline"
                    >Editar</button>
                    <button
                      onClick={() => handleResetPwd(u)}
                      className="text-xs text-amber-700 hover:underline"
                    >Reset pwd</button>
                    <button
                      onClick={() => handleDesactivar(u)}
                      className="text-xs text-red-700 hover:underline"
                    >Desactivar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <UsuarioFormModal
          user={user}
          editing={editingUser}
          onClose={() => { setShowModal(false); setEditingUser(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}


function UsuarioFormModal({ user, editing, onClose, onSave }) {
  const [form, setForm] = useState(
    editing
      ? { ...editing, password: "", password_nueva: "" }
      : {
          username: "", password: "", nombre_completo: "", email: "",
          role: ROLES.DOCENTE,
          establecimiento_id: user.establecimiento_id || null,
        }
  );

  const [submitting, setSubmitting] = useState(false);
  const [establecimientos, setEstablecimientos] = useState([]);

  // S5-26: cargar establecimientos al montar
  useEffect(() => {
    listarEstablecimientos().then(setEstablecimientos).catch(() => setEstablecimientos([]));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function generarPasswordSegura() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 14; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    update(editing ? "password_nueva" : "password", pwd);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Para edición: solo enviar los campos cambiados
      let payload;
      if (editing) {
        payload = {};
        if (form.nombre_completo !== editing.nombre_completo) payload.nombre_completo = form.nombre_completo;
        if (form.email !== editing.email) payload.email = form.email || null;
        if (form.role !== editing.role) payload.role = form.role;
        if (form.password_nueva) payload.password_nueva = form.password_nueva;
        if (Object.keys(payload).length === 0) {
          alert("Sin cambios.");
          setSubmitting(false);
          return;
        }
      } else {
        payload = {
          username: form.username,
          password: form.password,
          nombre_completo: form.nombre_completo,
          email: form.email || null,
          role: form.role,
          establecimiento_id: form.establecimiento_id,
        };
      }
      await onSave(payload);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6 space-y-3"
      >
        <h2 className="text-lg font-bold text-slate-900">
          {editing ? `Editar: ${editing.username}` : "Crear usuario"}
        </h2>

        {!editing && (
          <div>
            <label className="block text-sm text-slate-700">Username</label>
            <input
              type="text" required minLength={3} maxLength={64}
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              className="w-full mt-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm"
            />
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-700">Nombre completo</label>
          <input
            type="text" required minLength={2}
            value={form.nombre_completo}
            onChange={(e) => update("nombre_completo", e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-700">Email (opcional)</label>
          <input
            type="email"
            value={form.email || ""}
            onChange={(e) => update("email", e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-700">Rol</label>
          <select
            value={form.role}
            onChange={(e) => update("role", e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm"
            disabled={editing && editing.role === "admin" && user.role !== "admin"}
          >
            {Object.entries(NOMBRE_ROL).map(([v, label]) => (
              <option key={v} value={v}
                disabled={v === "admin" && user.role !== "admin"}
              >
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* S5-26: Establecimiento — solo al crear */}
        {!editing && (
          <div>
            <label className="block text-sm text-slate-700">
              Establecimiento <span className="text-red-500">*</span>
            </label>
            <select
              value={form.establecimiento_id || ""}
              onChange={(e) => update("establecimiento_id", e.target.value ? parseInt(e.target.value) : null)}
              required
              className="w-full mt-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm"
            >
              <option value="">— Selecciona establecimiento —</option>
              {establecimientos.map(est => (
                <option key={est.id} value={est.id}>
                  {est.nombre} (id: {est.id})
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm text-slate-700">
            {editing ? "Nueva contraseña (dejar en blanco para no cambiar)" : "Contraseña inicial (mín. 12 chars)"}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              minLength={editing ? 0 : 12}
              required={!editing}
              value={editing ? (form.password_nueva || "") : form.password}
              onChange={(e) => update(editing ? "password_nueva" : "password", e.target.value)}
              className="flex-1 mt-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm font-mono"
              placeholder={editing ? "(opcional)" : "mín. 12 caracteres"}
            />
            <button type="button" onClick={generarPasswordSegura}
              className="mt-1 px-3 text-xs bg-slate-100 hover:bg-slate-200 rounded-md">
              Generar
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md">
            Cancelar
          </button>
          <button type="submit" disabled={submitting}
            className="px-4 py-2 text-sm bg-kedas-primary hover:bg-blue-800 disabled:bg-slate-400 text-white rounded-md">
            {submitting ? "Guardando..." : editing ? "Guardar cambios" : "Crear"}
          </button>
        </div>
      </form>
    </div>
  );
}
