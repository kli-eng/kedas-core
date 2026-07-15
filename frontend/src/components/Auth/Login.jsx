// frontend/src/components/Auth/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../../services/api.js";

export default function Login() {
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { user } = await loginUser(credentials);
      localStorage.setItem("kedas_user", JSON.stringify(user));
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Usuario o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main id="main" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-kedas-primary to-blue-700 p-4">
      <section className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-kedas-primary">KEDAS v3.4.0</h1>
          <p className="text-sm text-slate-600 mt-1">
            Sistema de Inteligencia Educativa Local
          </p>
          <p className="text-xs text-slate-500 mt-1">Kairós Learning Intelligent</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4" aria-label="Formulario de inicio de sesión">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700">
              Usuario
            </label>
            <input
              id="username"
              type="text"
              required
              autoComplete="username"
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-kedas-primary focus:border-transparent"
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-kedas-primary focus:border-transparent"
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
            />
          </div>

          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-kedas-primary hover:bg-blue-800 disabled:bg-slate-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {loading ? "Ingresando..." : "Ingresar al sistema"}
          </button>
        </form>

        <footer className="mt-6 pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
          Datos protegidos · Ley 21.719 · Soberanía local garantizada
          <br />
          © 2026 KLI · Marca KEDAS en trámite INAPI
        </footer>
      </section>
    </main>
  );
}
