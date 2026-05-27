import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import HookahTimerApp from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HookahTimerApp />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
