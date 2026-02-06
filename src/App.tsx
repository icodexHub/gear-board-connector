import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import Login, { type Credentials, type DeviceInfo } from "./pages/Login";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const handleLogin = (info: DeviceInfo, creds: Credentials) => {
    setDeviceInfo(info);
    setCredentials(creds);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setDeviceInfo(null);
    setCredentials(null);
    setIsLoggedIn(false);
  };

  return (
    <>
      {isLoggedIn && deviceInfo && credentials ? (
        <Dashboard
          onLogout={handleLogout}
          deviceInfo={deviceInfo}
          credentials={credentials}
        />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </>
  );
}

export default App;
