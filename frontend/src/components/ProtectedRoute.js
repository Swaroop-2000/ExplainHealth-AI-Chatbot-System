import { auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const [user] = useAuthState(auth);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
}
