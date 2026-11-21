import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const entry = process.env.VLR_ENTRY || "src/content.ts";
const zip = process.argv.includes("--zip");

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const merge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
  return out;
};
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const base = { ...readJson("manifests/base.json"), version: pkg.version };

for (const target of ["chrome", "firefox"]) {
  const out = `dist/${target}`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(`${out}/icons`, { recursive: true });
  await build({
    entryPoints: [entry],
    outfile: `${out}/content.js`,
    bundle: true,
    format: "iife",
    target: "es2020",
    minify: false,
    sourcemap: false,
    logLevel: "warning",
  });
  cpSync(process.env.VLR_CSS || "src/content.css", `${out}/content.css`);
  for (const f of readdirSync("icons").filter((f) => f.endsWith(".png"))) cpSync(`icons/${f}`, `${out}/icons/${f}`);
  const manifest = merge(base, readJson(`manifests/${target}.json`));
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`built ${out}`);
}

if (zip) {
  mkdirSync("web-ext-artifacts", { recursive: true });
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  for (const target of ["chrome", "firefox"]) {
    execFileSync(
      npx,
      ["web-ext", "build", "--overwrite-dest", "--source-dir", `dist/${target}`,
        "--artifacts-dir", "web-ext-artifacts", "--filename", `vlr-calendar-${target}-${pkg.version}.zip`],
      { stdio: "inherit", shell: process.platform === "win32" },
    );
  }
}
