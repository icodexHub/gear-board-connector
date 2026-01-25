import { useAuthStore } from "./store/Auth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const loggedIn = useAuthStore(s => s.loggedIn);
  const login = useAuthStore(s => s.connect);
  const logout = useAuthStore(s => s.disconnect);

  return loggedIn ? <Dashboard onLogout={logout} /> : <Login onLogin={login} />;
}
