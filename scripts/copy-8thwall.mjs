import { cpSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Copia os artefatos do engine 8th Wall para public/ porque o xr.js resolve
// os chunks (xr-slam.js, resources/*) relativos a propria URL do script.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(projectRoot, "node_modules/@8thwall/engine-binary/dist");
const target = resolve(projectRoot, "public/8thwall");

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

console.log(`[copy-8thwall] Artefatos copiados para ${target}`);
