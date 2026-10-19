import { createRoot } from "react-dom/client";
import "@web/styles.css"; // base theme, fonts, HUD styles shared with the tunnel build
import "./styles.css";
import { App } from "./App";
import { installPortraitHold } from "./personal/orientation";

installPortraitHold();
createRoot(document.getElementById("root")!).render(<App />);
