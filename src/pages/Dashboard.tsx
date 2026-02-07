import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { DeviceInfo } from "./Login";
import AddUser from "./Adduser";

interface DashboardProps {
  onLogout: () => void;
  deviceInfo: DeviceInfo;
  credentials: {
    ip: string;
    username: string;
    password: string;
  };
}

interface LogEntry {
  timestamp: string;
  message: string;
}

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
}

interface AttendanceRecord {
  major: number;
  minor: number;
  time: string;
  employee_no: string;
  name: string;
  card_no: string;
  door_no: number;
  verify_mode: string;
}

const Dashboard: React.FC<DashboardProps> = ({
  onLogout,
  deviceInfo,
  credentials,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [activeTab, setActiveTab] = useState<"device" | "users" | "attendance">(
    "device",
  );
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [attendanceHours, setAttendanceHours] = useState(24);

  const logsEndRef = useRef<HTMLDivElement>(null);

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

  const handleDisconnect = async () => {
    try {
      await invoke("disconnect_device");
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
      setUsers(fetchedUsers);
    } catch (e) {
      console.error("Failed to fetch users:", e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleFetchAttendance = async () => {
    setLoadingAttendance(true);
    try {
      const records: AttendanceRecord[] = await invoke(
        "get_attendance_records",
        {
          ip: credentials.ip,
          username: credentials.username,
          password: credentials.password,
          hours: attendanceHours,
        },
      );
      setAttendanceRecords(records);
    } catch (e) {
      console.error("Failed to fetch attendance:", e);
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleUserAdded = async () => {
    setShowAddUser(false);
    await handleFetchUsers();
  };

  return (
    <div className="h-screen w-screen p-6 bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Device Dashboard</h1>
        <button
          onClick={handleDisconnect}
          className="px-4 py-2 rounded text-white font-semibold bg-red-500 hover:bg-red-600 transition"
        >
          Disconnect
        </button>
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
        <button
          onClick={() => setActiveTab("attendance")}
          className={`px-4 py-2 font-semibold transition ${
            activeTab === "attendance"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-blue-600"
          }`}
        >
          Attendance ({attendanceRecords.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "device" && (
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
              <p className="text-sm text-gray-500">Firmware Version</p>
              <p className="font-medium">{deviceInfo.firmwareVersion}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <>
          <div className="flex justify-between mb-4 gap-3">
            <button
              onClick={() => setShowAddUser(true)}
              className="px-4 py-2 rounded text-white font-semibold bg-blue-500 hover:bg-blue-600 transition"
            >
              + Add New User
            </button>
            <button
              onClick={handleFetchUsers}
              disabled={loadingUsers}
              className={`px-4 py-2 rounded text-white font-semibold transition ${
                loadingUsers
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-500 hover:bg-green-600"
              }`}
            >
              {loadingUsers ? "Loading..." : "Fetch All Users"}
            </button>
          </div>

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
                          : "No users found. Click 'Fetch All Users' to load."}
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

      {activeTab === "attendance" && (
        <>
          <div className="flex justify-between items-center mb-4 gap-4">
            <div className="flex gap-2 items-center">
              <label className="font-semibold">Last</label>
              <select
                value={attendanceHours}
                onChange={(e) => setAttendanceHours(Number(e.target.value))}
                className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>1 Hour</option>
                <option value={6}>6 Hours</option>
                <option value={12}>12 Hours</option>
                <option value={24}>24 Hours</option>
                <option value={48}>48 Hours</option>
                <option value={168}>7 Days</option>
                <option value={720}>30 Days</option>
              </select>
            </div>
            <button
              onClick={handleFetchAttendance}
              disabled={loadingAttendance}
              className={`px-4 py-2 rounded text-white font-semibold transition ${
                loadingAttendance
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-500 hover:bg-green-600"
              }`}
            >
              {loadingAttendance ? "Loading..." : "Fetch Records"}
            </button>
          </div>

          <div className="flex-1 bg-white rounded shadow overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Time
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Employee No
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Door
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Card No
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Verify Mode
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">
                      Event Type
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        {loadingAttendance
                          ? "Loading attendance records..."
                          : "No records found. Click 'Fetch Records' to load."}
                      </td>
                    </tr>
                  ) : (
                    attendanceRecords.map((record, idx) => (
                      <tr key={idx} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          {new Date(record.time).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {record.employee_no || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          {record.name || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {record.door_no || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {record.card_no || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              record.verify_mode === "fp"
                                ? "bg-blue-100 text-blue-800"
                                : record.verify_mode === "face"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {record.verify_mode || "Unknown"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {record.major}-{record.minor}
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

      {/* Add User Modal */}
      {showAddUser && (
        <AddUser
          credentials={credentials}
          onUserAdded={handleUserAdded}
          onCancel={() => setShowAddUser(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;
