import React from "react";
import { createRoot } from "react-dom/client";
import HitsWorkspace from "../../components/nexus-hits-v2/HitsWorkspace";
import "../../app/design-tokens.css";

createRoot(document.getElementById("root")!).render(
  <main id="main-content">
    <HitsWorkspace />
  </main>,
);
