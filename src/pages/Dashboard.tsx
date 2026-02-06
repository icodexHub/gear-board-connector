import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { DeviceInfo } from "./Login";

// Props
interface DashboardProps {
  onLogout: () => void;
  deviceInfo: DeviceInfo;
  credentials: {
    ip: string;
    username: string;
    password: string;
  };
}

// Log entry
interface LogEntry {
  timestamp: string;
  message: string;
}

// Offline Sync Task
interface SyncTask {
  id: string;
  timestamp: number;
  payload?: Record<string, unknown>;
  status: "pending" | "completed" | "failed";
}

// User Info
interface UserInfo {
  employee_no: string;
  name: string;
  user_type: string;
  valid: {
    enable: boolean;
    begin_time: string;
    end_time: string;
  };
  door_right: string;
  right_plan: Array<{
    door_no: string;
    plan_template_no: string;
  }>;
}

// Format duration like 1d 2h 3m 4s
const formatDuration = (startTime: Date) => {
  const now = new Date();
  const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
};

const Dashboard: React.FC<DashboardProps> = ({
  onLogout,
  deviceInfo,
  credentials,
}) => {
  const [deviceStatus, setDeviceStatus] = useState("Disconnected");
  const [connectionStart, setConnectionStart] = useState<Date | null>(null);
  const [connectionDuration, setConnectionDuration] = useState("-");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncQueue, setSyncQueue] = useState<SyncTask[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [activeTab, setActiveTab] = useState<"device" | "users">("device");

  const logsEndRef = useRef<HTMLDivElement>(null);

  /** -------------------- Logs -------------------- **/
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    listen<string>("log", (event) => {
      const timestamp = new Date().toLocaleTimeString();
      setLogs((prev) => [...prev, { timestamp, message: event.payload }]);
    })
      .then((u) => {
        unlisten = u;
      })
      .catch((e) => {
        console.error("listen error:", e);
      });
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  /** ---------------- Connection Duration ---------------- **/
  useEffect(() => {
    if (!connectionStart) return;
    const interval = setInterval(() => {
      setConnectionDuration(formatDuration(connectionStart));
    }, 1000);
    return () => clearInterval(interval);
  }, [connectionStart]);

  /** ---------------- Offline Sync Queue ---------------- **/
  useEffect(() => {
    const storedQueue = localStorage.getItem("syncQueue");
    if (storedQueue) setSyncQueue(JSON.parse(storedQueue));
  }, []);

  const saveQueue = (queue: SyncTask[]) => {
    setSyncQueue(queue);
    localStorage.setItem("syncQueue", JSON.stringify(queue));
  };

  const addToQueue = (payload?: Record<string, unknown>) => {
    const task: SyncTask = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      payload,
      status: "pending",
    };
    saveQueue([...syncQueue, task]);
  };

  const processQueue = async () => {
    const queue = [...syncQueue];
    const updatedQueue: SyncTask[] = await Promise.all(
      queue.map(async (task) => {
        if (task.status !== "pending") return task;
        try {
          await invoke("manual_sync", task.payload);
          return { ...task, status: "completed" as const };
        } catch {
          return { ...task, status: "failed" as const };
        }
      }),
    );
    saveQueue(updatedQueue);
  };

  /** ---------------- Auto Sync ---------------- **/
  // Every 10 minutes
  useEffect(() => {
    const interval = setInterval(
      () => {
        handleSync();
      },
      10 * 60 * 1000,
    );
    return () => clearInterval(interval);
  }, [syncQueue, deviceStatus]);

  // Daily at midnight
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() -
      now.getTime();
    const timeout = setTimeout(() => {
      handleSync();
      setInterval(handleSync, 24 * 60 * 60 * 1000); // Repeat every 24h
    }, msUntilMidnight);
    return () => clearTimeout(timeout);
  }, [syncQueue, deviceStatus]);

  /** ---------------- Connection Simulation ---------------- **/
  useEffect(() => {
    setDeviceStatus("Connected");
    setConnectionStart(new Date());
  }, []);

  /** ---------------- Handlers ---------------- **/
  const handleSync = async () => {
    if (deviceStatus !== "Connected") {
      addToQueue({});
      return;
    }
    setSyncing(true);
    try {
      await invoke("manual_sync");
      await processQueue();
    } catch (e) {
      console.error(e);
      addToQueue({});
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await invoke("disconnect_device");
      setDeviceStatus("Disconnected");
      setConnectionStart(null);
      setConnectionDuration("-");
      onLogout();
    } catch (e) {
      console.error(e);
    }
  };

  const handleFetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const fetchedUsers: UserInfo[] = await invoke("get_users", {
        ip: credentials.ip,
        username: credentials.username,
        password: credentials.password,
      });
      console.log({ fetchedUsers });
      setUsers(fetchedUsers);
    } catch (e) {
      console.error("Failed to fetch users:", e);
    } finally {
      setLoadingUsers(false);
    }
  };

  /** ---------------- UI ---------------- **/
  return (
    <div className="h-screen w-screen p-6 bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Device Dashboard</h1>
        <div className="flex gap-4">
          <button
            onClick={handleSync}
            disabled={syncing || deviceStatus !== "Connected"}
            className={`px-4 py-2 rounded text-white font-semibold transition ${
              syncing || deviceStatus !== "Connected"
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-600"
            }`}
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={deviceStatus !== "Connected"}
            className={`px-4 py-2 rounded text-white font-semibold transition ${
              deviceStatus !== "Connected"
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-red-500 hover:bg-red-600"
            }`}
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab("device")}
          className={`px-4 py-2 font-semibold transition ${
            activeTab === "device"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-blue-600"
          }`}
        >
          Device Info
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 font-semibold transition ${
            activeTab === "users"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-blue-600"
          }`}
        >
          Users ({users.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "device" ? (
        <>
          {/* Device Information Card */}
          <div className="bg-white rounded shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">
              Device Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Device Name</p>
                <p className="font-medium">{deviceInfo.deviceName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Model</p>
                <p className="font-medium">{deviceInfo.model}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Serial Number</p>
                <p className="font-medium text-sm">{deviceInfo.serialNumber}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Device ID</p>
                <p className="font-medium">{deviceInfo.deviceID}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">MAC Address</p>
                <p className="font-medium">{deviceInfo.macAddress}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Manufacturer</p>
                <p className="font-medium capitalize">
                  {deviceInfo.manufacturer}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Device Type</p>
                <p className="font-medium">{deviceInfo.deviceType}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Sub Device Type</p>
                <p className="font-medium">{deviceInfo.subDeviceType}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Firmware Version</p>
                <p className="font-medium">{deviceInfo.firmwareVersion}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Firmware Release Date</p>
                <p className="font-medium">{deviceInfo.firmwareReleasedDate}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Production Date</p>
                <p className="font-medium">{deviceInfo.productionDate}</p>
              </div>
            </div>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="p-4 bg-white rounded shadow">
              <h2 className="font-semibold mb-2">Device Status</h2>
              <p
                className={`font-bold text-lg ${
                  deviceStatus === "Connected"
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {deviceStatus}
              </p>
            </div>
            <div className="p-4 bg-white rounded shadow">
              <h2 className="font-semibold mb-2">Connection Duration</h2>
              <p className="text-lg">
                {deviceStatus === "Connected" ? connectionDuration : "-"}
              </p>
            </div>
            <div className="p-4 bg-white rounded shadow">
              <h2 className="font-semibold mb-2">Pending Sync Tasks</h2>
              <p className="text-lg font-bold text-blue-600">
                {syncQueue.filter((t) => t.status === "pending").length}
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Users Section */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Users List</h2>
            <button
              onClick={handleFetchUsers}
              disabled={loadingUsers || deviceStatus !== "Connected"}
              className={`px-4 py-2 rounded text-white font-semibold transition ${
                loadingUsers || deviceStatus !== "Connected"
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-500 hover:bg-green-600"
              }`}
            >
              {loadingUsers ? "Loading..." : "Fetch Users"}
            </button>
          </div>

          {/* Users Table */}
          <div className="flex-1 bg-white rounded shadow overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Employee No
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      User Type
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Valid From
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Valid Until
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Door Right
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        {loadingUsers
                          ? "Loading users..."
                          : "No users found. Click 'Fetch Users' to load."}
                      </td>
                    </tr>
                  ) : (
                    users.map((user, idx) => (
                      <tr key={idx} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          {user.employee_no}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          {user.name}
                        </td>
                        <td className="px-4 py-3 text-sm">{user.user_type}</td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              user.valid.enable
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {user.valid.enable ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {user.valid.begin_time || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {user.valid.end_time || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {user.door_right || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Logs */}
      <div className="mt-6 bg-white rounded shadow p-4 overflow-y-auto max-h-64">
        <h2 className="font-semibold mb-2">Device Logs</h2>
        <div className="text-sm font-mono space-y-1">
          {logs.length === 0 ? (
            <p className="text-gray-400">No logs yet...</p>
          ) : (
            logs.map((log, idx) => (
              <p key={idx}>
                <span className="text-gray-500">{log.timestamp}:</span>{" "}
                {log.message}
              </p>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
