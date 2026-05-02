import { defineConfig } from "vite";

export default defineConfig({
  // Usa nome do repositorio no GitHub Pages. Exemplo: /gate/
  base: process.env.VITE_BASE_URL || "/",
});
