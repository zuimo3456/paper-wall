import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({root:path.resolve("portable-web"),publicDir:path.resolve("public"),base:process.env.VITE_BASE_PATH||"/",plugins:[react()],build:{outDir:path.resolve("outputs/portable-site/public"),emptyOutDir:true}});
