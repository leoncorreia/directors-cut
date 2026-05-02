import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load `.env` from repo root (same file the Express server uses via ../.env from `server/`).
export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, ".."),
  server: {
    port: 5173,
  },
});
