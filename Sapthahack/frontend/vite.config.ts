import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const MAIN_PY = fileURLToPath(new URL("../backend/main.py", import.meta.url));
const MARKER = "\nWEBSITE_GZ_B64 = ";

// Packs the built JavaScript, CSS and login illustrations into one HTML page, gzips it and stores it as the last line of
// backend/main.py (WEBSITE_GZ_B64). The backend folder then needs only main.py + requirements.txt to deploy.
function singleFile(): Plugin {
  return {
    name: "citeverify-single-file",
    enforce: "post",
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.fileName === "index.html");
      if (!html || html.type !== "asset") return;
      let page = String(html.source);
      for (const f of Object.values(bundle)) {
        if (f.type === "chunk" && f.isEntry) {
          const code = f.code.replace(/<\/script/gi, "<\\/script");
          page = page.replace(new RegExp(`<script[^>]*src="[^"]*${f.fileName}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[f.fileName];
        } else if (f.type === "asset" && f.fileName.endsWith(".css")) {
          page = page.replace(new RegExp(`<link[^>]*href="[^"]*${f.fileName}"[^>]*>`), () => `<style>${String(f.source)}</style>`);
          delete bundle[f.fileName];
        }
      }
      const py = readFileSync(MAIN_PY, "utf8");
      const at = py.lastIndexOf(MARKER);
      if (at < 0) throw new Error("WEBSITE_GZ_B64 marker not found in backend/main.py");
      const b64 = gzipSync(Buffer.from(page), { level: 9 }).toString("base64");
      writeFileSync(MAIN_PY, py.slice(0, at) + MARKER + JSON.stringify(b64) + "\n");
      delete bundle[html.fileName];  // nothing is written to disk besides main.py
      console.log(`\n  website embedded in backend/main.py (${(page.length / 1e6).toFixed(2)} MB -> ${(b64.length / 1e6).toFixed(2)} MB gzip+base64)`);
    },
  };
}

// The production build goes straight into backend/main.py, so deploying needs only the backend folder (no Node.js).
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), singleFile()],
  publicDir: false,
  server: { port: 5173, proxy: { "/api": "http://localhost:8000" } },
  build: {
    outDir: "node_modules/.cv-build",      // stays empty: the page is written into backend/main.py
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,          // embed the login illustrations into index.html too
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: "assets/app.js", assetFileNames: "assets/app[extname]" } },
  },
}));
