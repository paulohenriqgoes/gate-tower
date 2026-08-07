import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Copia os artefatos do 8th Wall para public/ porque o xr.js resolve os chunks
// (xr-slam.js, resources/*) relativos a propria URL do script.
// O diretorio inteiro e copiado, e nao so o .js: os pacotes trazem o LICENSE
// junto, e servir esse arquivo e o que mantem a atribuicao exigida.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const artifacts = [
  { from: "node_modules/@8thwall/engine-binary/dist", to: "public/8thwall" },
  { from: "node_modules/@8thwall/coaching-overlay/dist", to: "public/coaching-overlay" },
];

for (const artifact of artifacts) {
  const source = resolve(projectRoot, artifact.from);
  const target = resolve(projectRoot, artifact.to);

  // Um pacote ausente nao pode derrubar o postinstall inteiro: quem so mexe no
  // modo tela consegue instalar e rodar sem os artefatos de RA.
  if (!existsSync(source)) {
    console.warn(`[copy-8thwall] Ignorado: ${artifact.from} nao encontrado.`);
    continue;
  }

  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });

  console.log(`[copy-8thwall] Artefatos copiados para ${target}`);
}
