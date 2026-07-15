

// frontend/src/services/api.js
// KEDAS v3.1.0 — Cliente HTTP centralizado (REEMPLAZA el de v3.0.2).
// Maneja JWT, timeouts, errores 401 con redirect.
// Licencia: AGPL-3.0-or-later

const API_BASE = import.meta.env.VITE_API_BASE || "/kedas-api/api/v1";

function getToken() {
  return localStorage.getItem("kedas_token");
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Tiempo de espera agotado");
    throw new Error("Sin conexión con el servidor KEDAS");
  }
  clearTimeout(timeout);

  if (res.status === 401) {
    localStorage.removeItem("kedas_token");
    localStorage.removeItem("kedas_user");
    if (!path.endsWith("/auth/me")) {
      window.location.href = "/kedas/login";
    }
    throw new Error("Sesión expirada");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// === Autenticación ===
export async function loginUser({ username, password }) {
  const body = new URLSearchParams();
  body.append("username", username);
  body.append("password", password);
  const res = await fetch(`${API_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (res.status === 401) throw new Error("Usuario o contraseña incorrectos");
  if (!res.ok) throw new Error(`Error ${res.status} al iniciar sesión`);
  const data = await res.json();
  localStorage.setItem("kedas_token", data.access_token);
  const user = await getMe();
  return { token: data.access_token, user };
}

export const getMe = () => request("/auth/me");
export const logoutUser = () => {
  localStorage.removeItem("kedas_token");
  localStorage.removeItem("kedas_user");
};

// === Dashboards ===
export const getDashboardDocente  = (id) => request(`/dashboard/docente/${id}`);
export const getDashboardUTP      = (id) => request(`/dashboard/utp/${id}`);
export const getDashboardDirector = (id) => request(`/dashboard/director/${id}`);
export const getKolibriOnline = (id) => request(`/kolibri/${id}/online`);
export const getKiraPrompts = () =>
  request(`/kira/prompts`);

export const ejecutarKira = (promptId, variables = {}, contextoExtra = '') =>
  request(`/kira/ejecutar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt_id: promptId,
      variables_contexto: variables,
      contexto_extra: contextoExtra,
    }),
  });

export const getEstudiantesKIRA = () =>
  request(`/kira/estudiantes`);

export const getContextoKIRA = (hash) =>
  request(`/kira/contexto/${hash}`);

export const getSITAN = (estId) =>
  request(`/indicadores/sitan/${estId}`);

export const getCorrelacion = (estId) =>
  request(`/curricular/correlacion/${estId}`);

export const getDUA = (estId) =>
  request(`/curricular/dua/${estId}`);

export const getCoberturaOA   = (id, asig='Matematica') => request(`/curricular/cobertura/${id}?asignatura=${asig}`);
export const getKpisSlep = (estId) => request(`/convivencia/kpis?establecimiento_id=${estId}`);

// === Predicciones / reportes ===
export const getRiesgo  = (hash) => request(`/predicciones/riesgo/${hash}`);
export const getReporte = (id)   => request(`/reportes/dashboard/${id}`);

// === Convivencia ===
export const listarAlertas = (estId) =>
  request(`/convivencia/alertas?establecimiento_id=${estId}`);
export const registrarIncidente = (payload) =>
  request(`/convivencia/incidentes`, { method: "POST", body: JSON.stringify(payload) });
export const confirmarAlerta = (id, payload) =>
  request(`/convivencia/alertas/${id}/confirmar`, {
    method: "POST", body: JSON.stringify(payload)
  });
export const desestimarAlerta = (id, payload) =>
  request(`/convivencia/alertas/${id}/desestimar`, {
    method: "POST", body: JSON.stringify(payload)
  });

export const getConvivenciaIncidentes = (estId, semanas = 4) =>
  request(`/convivencia/incidentes?establecimiento_id=${estId}&semanas=${semanas}`);

// === NUEVO v3.1.0 — Admin (CRUD usuarios) — G-09 ===
export const listarUsuarios = ({ incluir_inactivos = false, rol_filtro = null } = {}) => {
  const params = new URLSearchParams();
  if (incluir_inactivos) params.append("incluir_inactivos", "true");
  if (rol_filtro) params.append("rol_filtro", rol_filtro);
  const qs = params.toString();
  return request(`/admin/usuarios${qs ? "?" + qs : ""}`);
};
export const crearUsuario = (payload) =>
  request("/admin/usuarios", { method: "POST", body: JSON.stringify(payload) });
export const actualizarUsuario = (id, payload) =>
  request(`/admin/usuarios/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const desactivarUsuario = (id) =>
  request(`/admin/usuarios/${id}`, { method: "DELETE" });
export const resetPassword = (id) =>
  request(`/admin/usuarios/${id}/reset-password`, { method: "POST" });

// === NUEVO v3.1.0 — Pseudónimos (G-12) ===
export const crearPseudonimo = (payload) =>
  request("/pseudonimos", { method: "POST", body: JSON.stringify(payload) });
// === IA Local — Verificación normativa ===
export async function verificarRICE(archivo, tipo = "rice") {
  const formData = new FormData();
  formData.append("archivo", archivo);
  const token = localStorage.getItem("kedas_token");
  const endpoints = {
    rice:      "/ia/verificar-rice",
    digital:   "/ia/verificar-rice-digital",
    inclusion: "/ia/verificar-rice-inclusion",
  };
  const res = await fetch(`${API_BASE}${endpoints[tipo] || endpoints.rice}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

// === ARCO — B-04 ===
export const listarMisHijos = () => request("/apoderado/mis-hijos");

// === Incidentes pendientes de completar — S5-15 ===
export const listarIncidentesPendientes = (estId) =>
  request(`/convivencia/incidentes/pendientes?establecimiento_id=${estId}`);
export const completarIncidente = (id, data) =>
  request(`/convivencia/incidentes/${id}/completar`, {
    method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify(data)
  });

export const listarProtocolos = (estId, soloAbiertos = true) =>
  request(`/convivencia/protocolos?establecimiento_id=${estId}&solo_abiertos=${soloAbiertos}`);
export const crearSolicitudARCO = (data) => request("/apoderado/arco", {
  method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(data)
});
export const listarSolicitudesARCO = () => request("/apoderado/arco");

// === Panel Admin SLEP — S5-02 ===
export const listarEstablecimientosSlep = () => request("/admin/slep/establecimientos");
export const listarUsuariosSlep = () => request("/admin/slep/usuarios");
export const crearUsuarioSlep = (data) => request("/admin/slep/usuarios", {
  method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(data)
});

export const verificarPseudonimo = (hash_id) =>
  request(`/pseudonimos/verificar/${hash_id}`);

// === NUEVO v3.1.0 — Reporte SLEP MM 2026 PDF (G-11) ===
export async function descargarReporteSLEP(establecimiento_id, periodo_dias = 90) {
  const token = getToken();
  const res = await fetch(
    `${API_BASE}/reportes/slep-mm2026/${establecimiento_id}?periodo_dias=${periodo_dias}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`No se pudo generar el reporte: ${body || res.statusText}`);
  }
  // Trigger download
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const filename =
    res.headers.get("Content-Disposition")?.match(/filename="?([^"]+)"?/)?.[1] ||
    `slep_mm2026_est${establecimiento_id}.pdf`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// === Health ===
export const healthCheck = () =>
  fetch(`${API_BASE.replace("/api/v1", "")}/health`).then((r) => r.json());

export const listarREA = (queryString) => request(`/rea?${queryString}`);
export const obtenerREA = (reaId) => request(`/rea/${reaId}`);
export const crearREA = (payload) => request("/rea", { method: "POST", body: JSON.stringify(payload) });
export const eliminarREA = (reaId) => request(`/rea/${reaId}`, { method: "DELETE" });

export const listarEstablecimientos = () => request("/admin/establecimientos");
export const crearEstablecimiento = (payload) => request("/admin/establecimientos", { method: "POST", body: JSON.stringify(payload) });
export const actualizarEstablecimiento = (id, payload) => request(`/admin/establecimientos/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const toggleAutorREA = (reaId) =>
  request(`/rea/${reaId}/toggle-autor`, { method: "PATCH" });

// === Canal Denuncias Ley Karin ===
export const crearDenuncia = (payload) =>
  request("/denuncias", { method: "POST", body: JSON.stringify(payload) });
export const consultarDenuncia = (codigo) =>
  request(`/denuncias/consultar/${codigo}`);
export const listarDenuncias = (estado) =>
  request(`/denuncias${estado ? `?estado=${estado}` : ""}`);
export const actualizarDenuncia = (id, payload) =>
  request(`/denuncias/${id}/estado`, { method: "PATCH", body: JSON.stringify(payload) });

// === Estudiantes / Perfil 360° ===
export const listarEstudiantes = () => request("/estudiantes");
export const obtenerPerfil = (hashId) => request(`/estudiantes/${hashId}/perfil`);
export const obtenerProgreso = (hashId, dias = 30) =>
  request(`/estudiantes/${hashId}/progreso?periodo_dias=${dias}`);

// === Portal Apoderado ===
export const misHijos = () => request("/apoderado/mis-hijos");
export const otorgarConsentimiento = (payload) =>
  request("/apoderado/consentimiento", { method: "POST", body: JSON.stringify(payload) });
export const vincularHijo = (payload) =>
  request("/admin/apoderado/vincular", { method: "POST", body: JSON.stringify(payload) });
export const listarHijosApoderado = (usuarioId) =>
  request(`/admin/apoderado/${usuarioId}/hijos`);
export const desvincularHijo = (usuarioId, hashEstudiante) =>
  request(`/admin/apoderado/${usuarioId}/hijos/${hashEstudiante}`, { method: "DELETE" });
