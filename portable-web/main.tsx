import React from "react";
import {createRoot} from "react-dom/client";
import Wall from "../app/wall";
import "../app/globals.css";
import "../app/paper-motion.css";
createRoot(document.getElementById("root")!).render(<Wall/>);
