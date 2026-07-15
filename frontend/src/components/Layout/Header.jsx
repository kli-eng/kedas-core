// frontend/src/components/Layout/Header.jsx
import { useNavigate } from "react-router-dom";
import { logoutUser } from "../../services/api.js";
import { NOMBRE_ROL } from "../../utils/roles.js";
import { useState } from "react";
import OnboardingModal from "./OnboardingModal.jsx";

export default function Header({ user }) {
  const [mostrarAyuda, setMostrarAyuda] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    logoutUser();
    navigate("/login", { replace: true });
  };

  const headerJSX = (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center">
      <div className="flex items-center gap-3">
        <span className="text-kedas-primary font-bold text-lg">KEDAS</span>
        <span className="text-xs text-slate-400">v3.4.0</span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <button
          onClick={() => setMostrarAyuda(true)}
          className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 text-sm font-bold flex items-center justify-center transition-colors"
          title="Guía de KEDAS — ayuda sobre este panel"
          aria-label="Abrir guía de ayuda"
        >
          ?
        </button>
        <div className="text-right">
          <div className="font-medium text-slate-800">{user.nombre_completo}</div>
          <div className="text-xs text-slate-500">{NOMBRE_ROL[user.role] || user.role}</div>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-kedas-primary hover:underline"
          aria-label="Cerrar sesión"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
  return (
    <>
      {headerJSX}
      {mostrarAyuda && user && (
        <OnboardingModal
          user={user}
          onCerrar={() => setMostrarAyuda(false)}
          forzarMostrar
        />
      )}
    </>
  );
}
