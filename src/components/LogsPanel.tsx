import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

export default function LogsPanel() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const unlisten = listen<string>("log", (e) => {
      setLogs(l => [...l, e.payload]);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  return (
    <div style={panel}>
      <h4>Runtime Logs</h4>
      {logs.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}

const panel = {
  marginTop: 10,
  border: "1px solid #ccc",
  padding: 10,
  height: 200,
  overflow: "auto",
};
