import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
  // Usa nome do repositorio no GitHub Pages. Exemplo: /gate/
  base: process.env.VITE_BASE_URL || "/",
  // HTTPS no dev: acesso a camera (8th Wall) so funciona em contexto seguro.
  plugins: [basicSsl()],
  server: {
    host: true,
  },
});
