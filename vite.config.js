import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

// base "./" = relative paths, so the build works under
// https://<user>.github.io/<repo-name>/ without knowing the repo name.
export default defineConfig({
  plugins: [react()],
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
