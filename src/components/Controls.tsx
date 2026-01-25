import { invoke } from "@tauri-apps/api/core";
import { useAuthStore } from "../store/Auth";

export default function Controls() {
  const disconnect = useAuthStore(s => s.disconnect);

  return (
    <div style={{ display: "flex", gap: 10 }}>
      <button onClick={() => invoke("sync_now")}>Sync Now</button>
      <button onClick={() => { invoke("disconnect_device"); disconnect(); }}>
        Disconnect
      </button>
    </div>
  );
}
