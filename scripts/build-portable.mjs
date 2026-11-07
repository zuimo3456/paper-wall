import {spawnSync} from "node:child_process";
import {copyFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
for(const config of ["vite.portable-web.config.ts","vite.portable-server.config.ts"]){
  const result=spawnSync(process.execPath,["node_modules/vite/bin/vite.js","build","--config",config],{stdio:"inherit",env:process.env});
  if(result.status!==0)process.exit(result.status||1);
}
const output=resolve("outputs/portable-site");
for(const name of ["Dockerfile","compose.yml"])copyFileSync(resolve("portable-server",name),resolve(output,name));
copyFileSync(resolve("docs/独立部署说明.md"),resolve(output,"README.md"));
writeFileSync(resolve(output,"package.json"),JSON.stringify({name:"paper-wall",private:true,type:"module",engines:{node:">=24.0.0"},scripts:{start:"node server.mjs"}},null,2));
console.log(`Ready: ${output}`);
