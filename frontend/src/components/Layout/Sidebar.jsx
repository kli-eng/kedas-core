// frontend/src/components/Layout/Sidebar.jsx
import { NavLink } from "react-router-dom";
import { MENU_POR_ROL } from "../../utils/roles.js";

function ItemMenu({ item }) {
  return (
    <li key={item.path}>
      <NavLink
        to={item.path}
        end={item.path === "/dashboard"}
        className={({ isActive }) =>
          `block px-3 py-2 rounded-md text-sm transition-colors ${
            isActive
              ? "bg-kedas-primary text-white"
              : "hover:bg-slate-800 text-slate-300"
          }`
        }
      >
        {item.label}
      </NavLink>
    </li>
  );
}

export default function Sidebar({ user }) {
  const menu = MENU_POR_ROL[user.role] || { transversales: [], grupos: [] };

  return (
    <nav className="w-56 bg-slate-900 text-slate-100 min-h-screen p-4" aria-label="Menú principal">
      <ul className="space-y-1">
        {menu.transversales.map((item) => (
          <ItemMenu key={item.path} item={item} />
        ))}
      </ul>

      {/* FE-01 — Módulos DEC-30 agrupados */}
      {menu.grupos.length > 0 && (
        <div className="mt-4 space-y-3">
          {menu.grupos.map((grupo) => (
            <div key={grupo.modulo}>
              <div className="px-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                {grupo.nombre}
              </div>
              <ul className="space-y-1">
                {grupo.items.map((item) => (
                  <ItemMenu key={item.path} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <footer className="absolute bottom-4 text-xs text-slate-500">
        Soberanía local · Ley 21.719
      </footer>
    </nav>
  );
}
