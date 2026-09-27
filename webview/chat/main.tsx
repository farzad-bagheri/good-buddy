import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

if (import.meta.env.DEV) {
  await import("./dev-theme.css");
  await import("./dev-mock");
}

const root = document.getElementById("root");
if (!root) throw new Error("Chat webview root is missing.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
