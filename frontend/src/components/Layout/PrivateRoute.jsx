// frontend/src/components/Layout/PrivateRoute.jsx
import { Navigate } from "react-router-dom";

export default function PrivateRoute({ children }) {
  const token = localStorage.getItem("kedas_token");
  const user = localStorage.getItem("kedas_user");
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
