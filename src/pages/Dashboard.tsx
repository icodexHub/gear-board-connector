import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

// Props
interface DashboardProps {
  onLogout: () => void;
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

const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
  const [deviceStatus, setDeviceStatus] = useState("Disconnected");
  const [connectionStart, setConnectionStart] = useState<Date | null>(null);
  const [connectionDuration, setConnectionDuration] = useState("-");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncQueue, setSyncQueue] = useState<SyncTask[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);

  /** -------------------- Logs -------------------- **/
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    listen<string>("log", (event) => {
      const timestamp = new Date().toLocaleTimeString();
      setLogs(prev => [...prev, { timestamp, message: event.payload }]);
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
          return { ...task, status: "completed" };
        } catch {
          return { ...task, status: "failed" };
        }
      })
    );
    saveQueue(updatedQueue);
  };

  /** ---------------- Auto Sync ---------------- **/
  // Every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      handleSync();
    }, 10 * 60 * 1000);
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

  /** ---------------- UI ---------------- **/
  return (
    <div className="h-screen w-screen p-6 bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Device Dashboard</h1>
        <div className="flex gap-4 mb-6">
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

      {/* Device Info */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="p-4 bg-white rounded shadow">
          <h2 className="font-semibold mb-2">Device Status</h2>
          <p
            className={`font-bold ${
              deviceStatus === "Connected" ? "text-green-600" : "text-red-600"
            }`}
          >
            {deviceStatus}
          </p>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <h2 className="font-semibold mb-2">Connection Duration</h2>
          <p>{deviceStatus === "Connected" ? connectionDuration : "-"}</p>
        </div>
        <div className="p-4 bg-white rounded shadow col-span-2">
          <h2 className="font-semibold mb-2">Pending Sync Tasks</h2>
          <p>{syncQueue.filter(t => t.status === "pending").length}</p>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 bg-white rounded shadow p-4 overflow-y-auto">
        <h2 className="font-semibold mb-2">Device Logs</h2>
        <div className="text-sm font-mono space-y-1">
          {logs.length === 0 ? (
            <p className="text-gray-400">No logs yet...</p>
          ) : (
            logs.map((log, idx) => (
              <p key={idx}>
                <span className="text-gray-500">{log.timestamp}:</span> {log.message}
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
