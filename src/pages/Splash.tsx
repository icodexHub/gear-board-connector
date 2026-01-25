import React from "react";
import ReactDOM from "react-dom/client";
import "../index.css";

export default function Splash() {
  return (
    <div className="w-screen h-screen bg-white-900 flex flex-col items-center justify-center gap-3 text-black">
      <img src="../assets/logo.png" className="w-20 h-20" />
      <h2 className="text-xl font-bold">Gear Board Connector</h2>
      <p className="text-sm">Starting service…</p>
          <div className="loader" />
        <p className="text-sm">v0.05</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Splash />
  </React.StrictMode>
);
