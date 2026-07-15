// frontend/src/components/REA/REACatalog.jsx
// KEDAS v3.2.0 — A2 Catálogo REA mínimo
// Lista + filtros (asignatura, nivel, visibilidad) + detalle modal + crear REA

import { useEffect, useState, useCallback } from "react";
import { listarREA, crearREA, obtenerREA, toggleAutorREA } from "../../services/api.js";

// ── Constantes alineadas con kedas_rea CHECK constraints ──────────────────
const VISIBILIDAD_OPTS = [
  { value: "",              label: "Todas" },
  { value: "privado",       label: "Privado" },
  { value: "establecimiento", label: "Establecimiento" },
  { value: "slep",          label: "SLEP" },
  { value: "publico",       label: "Público" },
];

const LICENCIA_OPTS = [
  "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC-BY-NC-SA-4.0", "CC0-1.0"
];

const FORMATO_OPTS = ["html5", "scorm", "pdf", "video", "externo"];

const VISIBILIDAD_BADGE = {
  privado:         "bg-slate-100 text-slate-600",
  establecimiento: "bg-blue-50 text-blue-700",
  slep:            "bg-violet-50 text-violet-700",
  publico:         "bg-green-50 text-green-700",
};

const FORMATO_ICON = {
  html5:   "🌐",
  scorm:   "📦",
  pdf:     "📄",
  video:   "🎥",
  externo: "🔗",
};

// ── Formulario vacío base ─────────────────────────────────────────────────
const FORM_EMPTY = {
  titulo: "",
  descripcion: "",
  nivel_educativo: "",
  asignatura: "",
  formato: "html5",
  licencia_cc: "CC-BY-4.0",
  visibilidad: "establecimiento",
  url_externa: "",
  kolibri_content_id: "",
  autor_display: "establecimiento",
};

// ── Componente badge visibilidad ──────────────────────────────────────────
// ── S5-29: Licencias CC — patrón Kolibri (nombre completo + descripción simple + enlace oficial)
// Claves corresponden al campo licencia_cc de kedas_rea
const LICENCIAS_INFO = {
  "CC-BY-4.0": {
    label: "Creative Commons Atribución 4.0",
    short: "CC BY 4.0",
    desc:  "Uso libre para cualquier propósito. Solo debes citar al autor o autora.",
    url:   "https://creativecommons.org/licenses/by/4.0/deed.es",
    icono: "🛡",
  },
  "CC-BY-SA-4.0": {
    label: "Creative Commons Atribución-CompartirIgual 4.0",
    short: "CC BY-SA 4.0",
    desc:  "Uso libre. Debes citar al autor o autora y compartir con la misma licencia.",
    url:   "https://creativecommons.org/licenses/by-sa/4.0/deed.es",
    icono: "🛡",
  },
  "CC-BY-NC-4.0": {
    label: "Creative Commons Atribución-NoComercial 4.0",
    short: "CC BY-NC 4.0",
    desc:  "Solo para uso educativo o sin fines de lucro. Debes citar al autor o autora.",
    url:   "https://creativecommons.org/licenses/by-nc/4.0/deed.es",
    icono: "🛡",
  },
  "CC-BY-NC-SA-4.0": {
    label: "Creative Commons Atribución-NoComercial-CompartirIgual 4.0",
    short: "CC BY-NC-SA 4.0",
    desc:  "Solo para uso educativo o sin fines de lucro. Cita al autor y comparte igual.",
    url:   "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es",
    icono: "🛡",
  },
  "CC0-1.0": {
    label: "Dominio Público — Sin derechos reservados",
    short: "CC0 1.0",
    desc:  "Sin ninguna restricción de uso. Puedes copiar, modificar y distribuir libremente.",
    url:   "https://creativecommons.org/publicdomain/zero/1.0/deed.es",
    icono: "🌐",
  },
  // Aliases usados en datos históricos o importados desde Kolibri
  "CC-BY": {
    label: "Creative Commons Atribución",
    short: "CC BY",
    desc:  "Uso libre para cualquier propósito. Solo debes citar al autor o autora.",
    url:   "https://creativecommons.org/licenses/by/4.0/deed.es",
    icono: "🛡",
  },
  "CC0": {
    label: "Dominio Público",
    short: "CC0",
    desc:  "Sin ninguna restricción de uso.",
    url:   "https://creativecommons.org/publicdomain/zero/1.0/deed.es",
    icono: "🌐",
  },
  "establecimiento": {
    label: "Uso interno del establecimiento",
    short: "Uso interno",
    desc:  "Solo puede usarse dentro de este establecimiento educacional.",
    url:   null,
    icono: "🔒",
  },
};

// ── Componente LicenciaBadge — patrón Kolibri ─────────────────────────────
// Muestra: [icono] nombre_corto — al hover: descripción completa + enlace oficial CC
function LicenciaBadge({ codigo, className = "" }) {
  const info = LICENCIAS_INFO[codigo] || {
    label: codigo,
    short: codigo,
    desc:  codigo,
    url:   null,
    icono: "📋",
  };
  return (
    <span className={`group relative inline-flex items-center gap-1 ${className}`}>
      <span
        className="cursor-help border-b border-dashed border-slate-300 text-xs text-slate-500
                   hover:text-slate-700 hover:border-slate-500 transition-colors"
      >
        {info.icono} {info.short}
      </span>
      {/* Tooltip */}
      <span
        className="pointer-events-none absolute bottom-full left-0 mb-2 z-50
                   w-64 rounded-lg bg-slate-800 text-white text-xs p-3 shadow-xl
                   opacity-0 group-hover:opacity-100 transition-opacity duration-150"
      >
        <span className="block font-semibold mb-1">{info.label}</span>
        <span className="block text-slate-300 mb-2">{info.desc}</span>
        {info.url && (
          <a
            href={info.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto text-blue-300 hover:text-blue-200 underline"
            onClick={e => e.stopPropagation()}
          >
            Ver licencia en creativecommons.org →
          </a>
        )}
      </span>
    </span>
  );
}

function BadgeVisibilidad({ valor }) {
  const cls = VISIBILIDAD_BADGE[valor] || "bg-slate-100 text-slate-500";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {valor}
    </span>
  );
}

// ── Card REA individual ───────────────────────────────────────────────────
function REACard({ rea, onClick }) {
  return (
    <button
      onClick={() => onClick(rea)}
      className="w-full text-left bg-white rounded-lg shadow-sm border border-slate-100
                 hover:border-kedas-primary hover:shadow-md transition-all p-4 group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-lg">{FORMATO_ICON[rea.formato] || "📁"}</span>
        <BadgeVisibilidad valor={rea.visibilidad} />
      </div>
      <h3 className="text-sm font-semibold text-slate-800 group-hover:text-kedas-primary
                     line-clamp-2 mb-1">
        {rea.titulo}
      </h3>
      {rea.descripcion && (
        <p className="text-xs text-slate-500 line-clamp-2 mb-2">{rea.descripcion}</p>
      )}
      <div className="flex flex-wrap gap-1 mt-auto">
        {rea.nivel_educativo && (
          <span className="text-xs bg-slate-50 text-slate-600 px-2 py-0.5 rounded">
            {rea.nivel_educativo}
          </span>
        )}
        {rea.asignatura && (
          <span className="text-xs bg-slate-50 text-slate-600 px-2 py-0.5 rounded">
            {rea.asignatura}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <LicenciaBadge codigo={rea.licencia_cc} />
        <span>{rea.vistas} vista{rea.vistas !== 1 ? "s" : ""}</span>
      </div>
    </button>
  );
}

// ── Modal detalle REA ─────────────────────────────────────────────────────
function REAModal({ rea, onClose }) {
  if (!rea) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 z-10"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{FORMATO_ICON[rea.formato] || "📁"}</span>
            <BadgeVisibilidad valor={rea.visibilidad} />
          </div>
          <button onClick={onClose}
                  className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ×
          </button>
        </div>

        <h2 className="text-lg font-bold text-slate-800 mb-1">{rea.titulo}</h2>
        {rea.descripcion && (
          <p className="text-sm text-slate-600 mb-4">{rea.descripcion}</p>
        )}

        {/* Metadatos */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
          {[
            ["Nivel",      rea.nivel_educativo],
            ["Asignatura", rea.asignatura],
            ["Formato",    rea.formato],
            ["Licencia",
          rea.licencia_cc
            ? <LicenciaBadge codigo={rea.licencia_cc} className="text-sm" />
            : null
          ],
            ["Autor",      rea.autor_display === "nombre_completo" ? "Docente" : "Establecimiento"],
            ["Vistas",     rea.vistas],
          ].map(([k, v]) => v != null && v !== "" && (
            <div key={k}>
              <dt className="text-slate-400 font-medium">{k}</dt>
              <dd className="text-slate-700">{v}</dd>
            </div>
          ))}
        </dl>

        {/* Acceso al recurso */}
        <div className="flex flex-wrap gap-2 mt-2">
          {(rea.url_externa || rea.kolibri_content_id) && (
            <a href={rea.url_externa || (rea.kolibri_content_id ? `https://kedas-demo.duckdns.org/es-419/learn/#/topics/c/${rea.kolibri_content_id}` : "#")}
               target={rea.url_externa || rea.kolibri_content_id ? "_blank" : "_self"}
               rel="noopener noreferrer"
               onClick={(!rea.url_externa && !rea.kolibri_content_id) ? (e) => { e.preventDefault(); alert("Este recurso no tiene URL configurada. Contacta al administrador."); } : undefined}
               className="inline-flex items-center gap-2 text-sm font-medium
                          text-white bg-kedas-primary hover:bg-kedas-primary/90
                          px-4 py-2 rounded-lg transition-colors">
              Abrir recurso →
            </a>
          )}
          <button
            onClick={async () => { await toggleAutorREA(rea.id); onClose(); }}
            className="inline-flex items-center gap-2 text-sm font-medium
                       text-slate-600 border border-slate-200 hover:border-slate-400
                       px-4 py-2 rounded-lg transition-colors">
            {rea.autor_display === "nombre_completo" ? "👤 Ocultar mi nombre" : "👤 Mostrar mi nombre"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal crear REA ───────────────────────────────────────────────────────
function CrearREAModal({ establecimientoId, onClose, onCreado }) {
  const [form, setForm]     = useState(FORM_EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.titulo.trim()) { setError("El título es obligatorio."); return; }
    if (!form.url_externa.trim() && !form.kolibri_content_id.trim()) {
      setError("Debes ingresar una URL externa o un ID de Kolibri."); return;
    }
    setSaving(true); setError(null);
    try {
      await crearREA({
        ...form,
        establecimiento_id: establecimientoId,
        url_externa:        form.url_externa.trim()        || null,
        kolibri_content_id: form.kolibri_content_id.trim() || null,
        descripcion:        form.descripcion.trim()        || null,
      });
      onCreado();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 z-10
                      max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Nuevo REA</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200
                          rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Título */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">
              Título <span className="text-red-500">*</span>
            </label>
            <input value={form.titulo} onChange={e => set("titulo", e.target.value)}
                   className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                              focus:outline-none focus:ring-2 focus:ring-kedas-primary/30"
                   placeholder="Ej: Introducción a las fracciones" />
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Descripción</label>
            <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)}
                      rows={2}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-kedas-primary/30 resize-none"
                      placeholder="Descripción breve del recurso" />
          </div>

          {/* Nivel + Asignatura */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Nivel educativo</label>
              <input value={form.nivel_educativo} onChange={e => set("nivel_educativo", e.target.value)}
                     className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                                focus:outline-none focus:ring-2 focus:ring-kedas-primary/30"
                     placeholder="Ej: 3° Básico" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Asignatura</label>
              <input value={form.asignatura} onChange={e => set("asignatura", e.target.value)}
                     className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                                focus:outline-none focus:ring-2 focus:ring-kedas-primary/30"
                     placeholder="Ej: Matemáticas" />
            </div>
          </div>

          {/* Formato + Licencia */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Formato</label>
              <select value={form.formato} onChange={e => set("formato", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-kedas-primary/30 bg-white">
                {FORMATO_OPTS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Licencia CC</label>
              <select value={form.licencia_cc} onChange={e => set("licencia_cc", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-kedas-primary/30 bg-white">
                {LICENCIA_OPTS.map(l => (
                  <option key={l} value={l}>
                    {LICENCIAS_INFO[l]?.short || l} — {LICENCIAS_INFO[l]?.desc || l}
                  </option>
                ))}
              </select>
              {/* S5-29: Panel informativo — patrón Kolibri (nombre completo + descripción + enlace oficial) */}
              {form.licencia_cc && LICENCIAS_INFO[form.licencia_cc] && (
                <div className="mt-2 p-3 bg-blue-50 rounded-md border border-blue-100">
                  <p className="text-sm font-semibold text-slate-700">
                    {LICENCIAS_INFO[form.licencia_cc].icono} {LICENCIAS_INFO[form.licencia_cc].label}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {LICENCIAS_INFO[form.licencia_cc].desc}
                  </p>
                  {LICENCIAS_INFO[form.licencia_cc].url && (
                    <a
                      href={LICENCIAS_INFO[form.licencia_cc].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-kedas-primary hover:underline mt-1 inline-block"
                    >
                      Ver licencia oficial ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Visibilidad */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Visibilidad</label>
            <select value={form.visibilidad} onChange={e => set("visibilidad", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-kedas-primary/30 bg-white">
              {VISIBILIDAD_OPTS.filter(o => o.value).map(o =>
                <option key={o.value} value={o.value}>{o.label}</option>
              )}
            </select>
          </div>

          {/* URL externa */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">
              URL externa <span className="text-slate-400">(o ID Kolibri)</span>
            </label>
            <input value={form.url_externa} onChange={e => set("url_externa", e.target.value)}
                   className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                              focus:outline-none focus:ring-2 focus:ring-kedas-primary/30"
                   placeholder="https://..." />
          </div>

          {/* Kolibri content ID */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">
              ID en Kolibri <span className="text-slate-400">(si está en canal local)</span>
            </label>
            <input value={form.kolibri_content_id}
                   onChange={e => set("kolibri_content_id", e.target.value)}
                   className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                              focus:outline-none focus:ring-2 focus:ring-kedas-primary/30"
                   placeholder="ID del contenido en Kolibri" />
          </div>

          {/* Autor display */}
          <div className="flex items-center gap-3 pt-1">
            <input type="checkbox" id="autor-display"
                   checked={form.autor_display === "nombre_completo"}
                   onChange={e => set("autor_display", e.target.checked ? "nombre_completo" : "establecimiento")}
                   className="rounded border-slate-300 text-kedas-primary" />
            <label htmlFor="autor-display" className="text-xs text-slate-600">
              Mostrar mi nombre como autor (en lugar del establecimiento)
            </label>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-kedas-primary
                             hover:bg-kedas-primary/90 rounded-lg transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Guardando…" : "Crear REA"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function REACatalog({ user }) {
  const [items,       setItems]       = useState([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [selected,    setSelected]    = useState(null);   // detalle modal
  const [showCrear,   setShowCrear]   = useState(false);  // crear modal

  // Filtros
  const [filtroVis,   setFiltroVis]   = useState("");
  const [filtroAsig,  setFiltroAsig]  = useState("");
  const [filtroNivel, setFiltroNivel] = useState("");
  const [busqueda,    setBusqueda]    = useState("");

  const estId = user?.establecimiento_id || 3;

  const cargar = useCallback(() => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ establecimiento_id: estId, limit: 50 });
    if (filtroVis)   params.append("visibilidad", filtroVis);
    if (filtroAsig)  params.append("asignatura",  filtroAsig);
    if (filtroNivel) params.append("nivel_educativo", filtroNivel);

    listarREA(params.toString())
      .then(d => { setItems(d.items || []); setTotal(d.total || 0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [estId, filtroVis, filtroAsig, filtroNivel]);

  useEffect(() => { cargar(); }, [cargar]);

  // Filtro de búsqueda local (título)
  const itemsFiltrados = busqueda.trim()
    ? items.filter(r => r.titulo.toLowerCase().includes(busqueda.toLowerCase()))
    : items;

  // Opciones únicas para filtros desde los datos cargados
  const asignaturas = [...new Set(items.map(r => r.asignatura).filter(Boolean))].sort();
  const niveles     = [...new Set(items.map(r => r.nivel_educativo).filter(Boolean))].sort();

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Recursos Educativos Abiertos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} recurso{total !== 1 ? "s" : ""} disponible{total !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCrear(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
                     text-white bg-kedas-primary hover:bg-kedas-primary/90
                     rounded-lg transition-colors shadow-sm">
          + Nuevo REA
        </button>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por título…"
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-52
                     focus:outline-none focus:ring-2 focus:ring-kedas-primary/30"
        />
        <select value={filtroVis} onChange={e => setFiltroVis(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-kedas-primary/30">
          {VISIBILIDAD_OPTS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {asignaturas.length > 0 && (
          <select value={filtroAsig} onChange={e => setFiltroAsig(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-kedas-primary/30">
            <option value="">Todas las asignaturas</option>
            {asignaturas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {niveles.length > 0 && (
          <select value={filtroNivel} onChange={e => setFiltroNivel(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-kedas-primary/30">
            <option value="">Todos los niveles</option>
            {niveles.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        {(filtroVis || filtroAsig || filtroNivel || busqueda) && (
          <button
            onClick={() => { setFiltroVis(""); setFiltroAsig(""); setFiltroNivel(""); setBusqueda(""); }}
            className="text-xs text-slate-400 hover:text-slate-600 px-2 underline">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex justify-center py-16 text-slate-400 text-sm">
          Cargando recursos…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      ) : itemsFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <span className="text-4xl mb-3">📚</span>
          <p className="text-sm font-medium">
            {total === 0 ? "Aún no hay recursos en este establecimiento" : "Sin resultados para los filtros aplicados"}
          </p>
          {total === 0 && (
            <button onClick={() => setShowCrear(true)}
                    className="mt-3 text-sm text-kedas-primary hover:underline">
              Crear el primer REA →
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {itemsFiltrados.map(rea => (
            <REACard key={rea.id} rea={rea} onClick={setSelected} />
          ))}
        </div>
      )}

      {/* Modales */}
      {selected && <REAModal rea={selected} onClose={() => setSelected(null)} />}
      {showCrear && (
        <CrearREAModal
          establecimientoId={estId}
          onClose={() => setShowCrear(false)}
          onCreado={() => { setShowCrear(false); cargar(); }}
        />
      )}
    </div>
  );
}
