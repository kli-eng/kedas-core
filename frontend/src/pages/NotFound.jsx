// frontend/src/pages/NotFound.jsx
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-kedas-primary">404</h1>
        <p className="mt-3 text-slate-700">Página no encontrada.</p>
        <Link
          to="/dashboard"
          className="mt-6 inline-block bg-kedas-primary hover:bg-blue-800 text-white px-4 py-2 rounded-md text-sm"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
