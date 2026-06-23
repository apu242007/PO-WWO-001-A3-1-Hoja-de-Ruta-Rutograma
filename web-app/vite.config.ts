import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves under /<repo>/. VITE_BASE is injected by the deploy workflow.
// Local dev / demo falls back to "/".
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
