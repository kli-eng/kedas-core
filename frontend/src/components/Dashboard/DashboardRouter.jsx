// frontend/src/components/Dashboard/DashboardRouter.jsx
import { useEffect, useState } from "react";
import DashboardDocente from "./DashboardDocente.jsx";
import DashboardUTP from "./DashboardUTP.jsx";
import DashboardDirector from "./DashboardDirector.jsx";
import DashboardAdmin from "./DashboardAdmin.jsx";
import REACatalog from "../REA/REACatalog.jsx";
import Perfil360 from "../Estudiantes/Perfil360.jsx";
import DashboardInicio from "./DashboardInicio.jsx";
import ModuloProximamente from "../Layout/ModuloProximamente.jsx";
import { useLocation } from "react-router-dom";
import Header from "../Layout/Header.jsx";
import Sidebar from "../Layout/Sidebar.jsx";
import OnboardingModal, { useOnboarding } from "../Layout/OnboardingModal.jsx";

function DashboardSLEPPlaceholder({ user }) {
  return (
    <ModuloProximamente
      modulo="Panel SLEP"
      nombre="Panel de Supervisión SLEP"
      descripcion="Disponible con licencia comercial KLI. Contacto: hola@kli.cl"
    />
  );
}

function DashboardConvivenciaPlaceholder({ user }) {
  return (
    <ModuloProximamente
      modulo="MOD-02"
      nombre="Convivencia Escolar"
      descripcion="Disponible con licencia comercial KLI. Contacto: hola@kli.cl"
    />
  );
}

function ApoderadoPlaceholder({ user }) {
  return (
    <ModuloProximamente
      modulo="Portal Apoderado"
      nombre="Portal Apoderado + Consentimientos"
      descripcion="Disponible con licencia comercial KLI (Tier 1 Compliance Plus). Contacto: hola@kli.cl"
    />
  );
}

const ROLE_COMPONENTS = {
  slep_tecnico: DashboardSLEPPlaceholder,
  docente: DashboardDocente,
  utp: DashboardUTP,
  director: DashboardDirector,
  orientador: DashboardConvivenciaPlaceholder,
  psicologo: DashboardConvivenciaPlaceholder,
  coordinador_convivencia: DashboardConvivenciaPlaceholder,
  apoderado: ApoderadoPlaceholder,
  admin: DashboardAdmin
};

export default function DashboardRouter() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("kedas_user");
    if (stored) setUser(JSON.parse(stored));
    setReady(true);
  }, []);

  // S5-03: hook debe llamarse antes de cualquier return condicional (Rules of Hooks)
  const { mostrar: mostrarOnboarding, cerrar: cerrarOnboarding } = useOnboarding(user);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kedas-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen text-slate-600">
        Sesión no válida. Vuelve a iniciar sesión.
      </div>
    );
  }

  const { pathname } = useLocation();
  const esREA = pathname === '/dashboard/rea';
  const esDenuncias = pathname === '/dashboard/denuncias';
  const esEstudiantes = pathname === '/dashboard/estudiantes';
  const esIncidente   = pathname === '/dashboard/incidente';
  const esConvivencia = pathname === '/dashboard/convivencia';
  const esReportes    = pathname === '/dashboard/reportes';
  const esCurricular  = pathname === '/dashboard/curricular';
  const esKira        = pathname === '/dashboard/kira';
  const esPredicciones = pathname === '/dashboard/predicciones';
  const esCumplimiento = pathname === '/dashboard/cumplimiento';
  const Component = ROLE_COMPONENTS[user.role] || DashboardDocente;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col">
        <Header user={user} />
        <main id="main" className="flex-1 overflow-x-auto">
          {esEstudiantes ? <Perfil360 user={user} /> : esDenuncias ? (
                <ModuloProximamente
                  modulo="Canal Denuncias"
                  nombre="Canal de Denuncias — Ley Karin"
                  descripcion="Disponible con licencia comercial KLI (Tier 1 Compliance Plus). Contacto: hola@kli.cl"
                />
              ) : esREA ? <REACatalog user={user} /> : esIncidente ? (
              <ModuloProximamente
                modulo="Registro de Incidentes"
                nombre="Registro de Incidentes"
                descripcion="Disponible con licencia comercial KLI. Contacto: hola@kli.cl"
              />
            ) : esConvivencia ? (
              <ModuloProximamente
                modulo="MOD-02"
                nombre="Convivencia Escolar"
                descripcion="Disponible con licencia comercial KLI. Contacto: hola@kli.cl"
              />
            ) : esCurricular ? (
              <ModuloProximamente
                modulo="MOD-03"
                nombre="Inteligencia Curricular"
                descripcion="Disponible con licencia comercial KLI. Contacto: hola@kli.cl"
              />
            ) :
          pathname === '/dashboard' ? <DashboardInicio user={user} /> :
          esKira ? (
            <ModuloProximamente
              modulo="MOD-08"
              nombre="KIRA — Asistente Pedagógico"
              descripcion="Disponible con licencia comercial KLI. Contacto: hola@kli.cl"
            />
          ) :
          esReportes ? (
            <ModuloProximamente
              modulo="Reportes SLEP"
              nombre="Reportes SLEP"
              descripcion="Disponible con licencia comercial KLI. Contacto: hola@kli.cl"
            />
          ) :
          esPredicciones ? (
            <ModuloProximamente
              modulo="MOD-06"
              nombre="Predicciones"
              descripcion="Modelo de predicción de riesgo académico con IA local (Ollama). Disponible próximamente."
            />
          ) :
          esCumplimiento ? (
            <ModuloProximamente
              modulo="MOD-05"
              nombre="Cumplimiento Normativo"
              descripcion="Verificación automática de RICE y otros documentos normativos. Disponible próximamente."
            />
          ) : <Component user={user} />}
        </main>
      </div>
      {mostrarOnboarding && (
        <OnboardingModal user={user} onCerrar={cerrarOnboarding} />
      )}

    </div>
  );
}
