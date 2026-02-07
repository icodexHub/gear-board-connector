import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AddUserProps {
  credentials: {
    ip: string;
    username: string;
    password: string;
  };
  onUserAdded: () => void;
  onCancel: () => void;
}

const AddUser: React.FC<AddUserProps> = ({
  credentials,
  onUserAdded,
  onCancel,
}) => {
  const [formData, setFormData] = useState({
    employeeNo: "",
    name: "",
    userType: "normal",
    enable: true,
    beginTime: "2020-01-01T00:00:00",
    endTime: "2030-01-01T00:00:00",
    doorRight: "1",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await invoke("add_user", {
        ip: credentials.ip,
        username: credentials.username,
        password: credentials.password,
        employeeNo: formData.employeeNo,
        name: formData.name,
        userType: formData.userType,
        enable: formData.enable,
        beginTime: formData.beginTime,
        endTime: formData.endTime,
        doorRight: formData.doorRight,
      });

      setSuccess(true);
      setTimeout(() => {
        onUserAdded();
      }, 1500);
    } catch (e) {
      setError(e as string);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Add New User</h2>
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
              User added successfully!
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Employee Number */}
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Employee Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="employeeNo"
                  value={formData.employeeNo}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 123456"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., John Doe"
                />
              </div>

              {/* User Type */}
              <div>
                <label className="block text-sm font-semibold mb-2">
                  User Type
                </label>
                <select
                  name="userType"
                  value={formData.userType}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="normal">Normal</option>
                  <option value="visitor">Visitor</option>
                  <option value="blacklist">Blacklist</option>
                  <option value="administrator">Administrator</option>
                </select>
              </div>

              {/* Door Right */}
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Door Right
                </label>
                <input
                  type="text"
                  name="doorRight"
                  value={formData.doorRight}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 1"
                />
              </div>

              {/* Begin Time */}
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Valid From
                </label>
                <input
                  type="datetime-local"
                  name="beginTime"
                  value={formData.beginTime}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* End Time */}
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Valid Until
                </label>
                <input
                  type="datetime-local"
                  name="endTime"
                  value={formData.endTime}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Enable Status */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="enable"
                checked={formData.enable}
                onChange={handleChange}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label className="text-sm font-semibold">Enable User</label>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 px-4 py-2 rounded text-white font-semibold transition ${
                  loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600"
                }`}
              >
                {loading ? "Adding User..." : "Add User"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddUser;
