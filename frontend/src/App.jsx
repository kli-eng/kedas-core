// frontend/src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Auth/Login.jsx";
import PrivateRoute from "./components/Layout/PrivateRoute.jsx";
import DashboardRouter from "./components/Dashboard/DashboardRouter.jsx";
import NotFound from "./pages/NotFound.jsx";

export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">Saltar al contenido principal</a>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard/*"
          element={
            <PrivateRoute>
              <DashboardRouter />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
