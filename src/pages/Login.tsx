import { useState, type ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface DeviceInfo {
  deviceName: string;
  deviceID: string;
  model: string;
  serialNumber: string;
  macAddress: string;
  firmwareVersion: string;
  firmwareReleasedDate: string;
  deviceType: string;
  subDeviceType: string;
  manufacturer: string;
  productionDate: string;
}

export interface Credentials {
  ip: string;
  username: string;
  password: string;
}

interface LoginProps {
  onLogin: (deviceInfo: DeviceInfo, credentials: Credentials) => void;
}

interface FormState {
  ip: string;
  username: string;
  password: string;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [form, setForm] = useState<FormState>({
    ip: "192.168.8.153",
    username: "admin",
    password: "123456789A@",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleConnect = async () => {
    if (!form.ip || !form.username || !form.password) {
      setError("All fields are required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const deviceInfo: DeviceInfo = await invoke("connect_device", {
        ip: form.ip,
        username: form.username,
        password: form.password,
      });

      if (deviceInfo) {
        console.log("Device Info:", deviceInfo);
        onLogin(deviceInfo, {
          ip: form.ip,
          username: form.username,
          password: form.password,
        });
      } else {
        setError("Failed to connect. Check credentials.");
      }
    } catch (e: unknown) {
      setError((e as Error)?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-white w-screen">
      <div className="bg-white p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">Device Login</h1>

        <input
          type="text"
          name="ip"
          placeholder="Network IP"
          value={form.ip}
          onChange={handleChange}
          className="w-full mb-4 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <input
          type="text"
          name="username"
          placeholder="Username"
          value={form.username}
          onChange={handleChange}
          className="w-full mb-4 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          className="w-full mb-6 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {error && (
          <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
        )}

        <button
          onClick={handleConnect}
          disabled={loading}
          className={`w-full py-2 rounded bg-primary text-white font-semibold hover:bg-primary-focus transition ${
            loading ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          {loading ? "Connecting..." : "Connect"}
        </button>
      </div>
    </div>
  );
};

export default Login;
