import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Exclude @agently/bridge from pre-bundling because it's a 
    // workspace package pointing directly to .ts source files.
    exclude: ["@agently/bridge"],
  },
});
