import {defineConfig} from "vite";
import path from "node:path";
export default defineConfig({build:{outDir:path.resolve("outputs/portable-site"),emptyOutDir:false,target:"node24",lib:{entry:path.resolve("portable-server/server.ts"),formats:["es"],fileName:()=>"server.mjs"},rollupOptions:{external:[/^node:/]},minify:false}});
