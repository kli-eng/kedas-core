// frontend/src/components/Auth/Login.jsx
// DEC-73 (16-oct-2026): si la contraseña fue fijada por otra persona (cuenta nueva o
// restablecida), se pide cambiarla antes de entrar. Política según NIST SP 800-63B-4
// y OWASP ASVS: de 15 a 64 caracteres, sin exigir símbolos ni mayúsculas.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, cambiarPassword } from "../../services/api.js";

const MIN = 15;
const MAX = 64;

const claseInput =
  "mt-1 w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-kedas-primary focus:border-transparent";

export default function Login() {
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenCambio, setTokenCambio] = useState(null);
  const [nueva, setNueva] = useState({ password: "", confirmar: "" });
  const navigate = useNavigate();

  const entrar = async (password) => {
    const res = await loginUser({ username: credentials.username, password });
    if (res.debeCambiar) {
      setTokenCambio(res.tokenTemporal);
      return;
    }
    localStorage.setItem("kedas_user", JSON.stringify(res.user));
    navigate("/dashboard");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await entrar(credentials.password);
    } catch (err) {
      setError(err.message || "Usuario o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  };

  const handleCambio = async (e) => {
    e.preventDefault();
    setError("");
    if (nueva.password !== nueva.confirmar) {
      setError("Las dos contraseñas nuevas no coinciden.");
      return;
    }
    if (nueva.password.length < MIN) {
      setError(`La contraseña nueva debe tener al menos ${MIN} caracteres.`);
      return;
    }
    setLoading(true);
    try {
      await cambiarPassword({
        token: tokenCambio,
        passwordActual: credentials.password,
        passwordNueva: nueva.password,
      });
      const passwordNueva = nueva.password;
      setTokenCambio(null);
      setNueva({ password: "", confirmar: "" });
      setCredentials({ ...credentials, password: passwordNueva });
      await entrar(passwordNueva);
    } catch (err) {
      setError(err.message || "No se pudo cambiar la contraseña.");
      if ((err.message || "").includes("expiró")) {
        setTokenCambio(null);
        setNueva({ password: "", confirmar: "" });
        setCredentials({ ...credentials, password: "" });
      }
    } finally {
      setLoading(false);
    }
  };

  const volver = () => {
    setTokenCambio(null);
    setNueva({ password: "", confirmar: "" });
    setCredentials({ ...credentials, password: "" });
    setError("");
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

        {!tokenCambio && (
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
                className={claseInput}
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
                className={claseInput}
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
        )}

        {tokenCambio && (
          <form onSubmit={handleCambio} className="space-y-4" aria-label="Cambio obligatorio de contraseña">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Elija una contraseña nueva</h2>
              <p className="text-sm text-slate-600 mt-1">
                Su contraseña actual la creó otra persona. Para proteger su cuenta, elija una
                nueva antes de entrar.
              </p>
            </div>

            <ul className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1 list-disc list-inside">
              <li>Entre {MIN} y {MAX} caracteres. Una frase de varias palabras funciona bien.</li>
              <li>No se exigen símbolos, números ni mayúsculas.</li>
              <li>No use su nombre de usuario ni la palabra «KEDAS».</li>
              <li>Se rechazan las contraseñas conocidas o filtradas en internet.</li>
            </ul>

            <div>
              <label htmlFor="password-nueva" className="block text-sm font-medium text-slate-700">
                Contraseña nueva
              </label>
              <input
                id="password-nueva"
                type="password"
                required
                minLength={MIN}
                maxLength={MAX}
                autoComplete="new-password"
                aria-describedby="largo-nueva"
                className={claseInput}
                value={nueva.password}
                onChange={(e) => setNueva({ ...nueva, password: e.target.value })}
              />
              <p id="largo-nueva" className="text-xs text-slate-500 mt-1">
                {nueva.password.length} de al menos {MIN} caracteres
              </p>
            </div>

            <div>
              <label htmlFor="password-confirmar" className="block text-sm font-medium text-slate-700">
                Repita la contraseña nueva
              </label>
              <input
                id="password-confirmar"
                type="password"
                required
                maxLength={MAX}
                autoComplete="new-password"
                className={claseInput}
                value={nueva.confirmar}
                onChange={(e) => setNueva({ ...nueva, confirmar: e.target.value })}
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
              {loading ? "Guardando..." : "Guardar y entrar"}
            </button>
            <button
              type="button"
              onClick={volver}
              className="w-full text-sm text-slate-600 hover:text-slate-800 underline"
            >
              Volver al inicio de sesión
            </button>
          </form>
        )}

        <footer className="mt-6 pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
          Diseñado para instalación local · Se alinea con la Ley 21.719
          <br />
          © 2026 KLI
        </footer>
      </section>
    </main>
  );
}
