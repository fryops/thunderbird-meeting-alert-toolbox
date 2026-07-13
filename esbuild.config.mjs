import esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const extensionSrcDir = path.join(rootDir, "src", "extension");
const extensionDistDir = path.join(rootDir, "dist", "extension");

const commonBuildOptions = {
  bundle: true,
  platform: "browser",
  sourcemap: true,
  target: "es2022",
  logLevel: "info",
};

async function copyStaticAssets() {
  await cp(
    path.join(extensionSrcDir, "manifest.json"),
    path.join(extensionDistDir, "manifest.json"),
  );
  await cp(
    path.join(extensionSrcDir, "companion", "companion.html"),
    path.join(extensionDistDir, "companion", "companion.html"),
  );
  await cp(
    path.join(extensionSrcDir, "companion", "companion.css"),
    path.join(extensionDistDir, "companion", "companion.css"),
  );
  await cp(path.join(extensionSrcDir, "icons"), path.join(extensionDistDir, "icons"), {
    recursive: true,
  });
  await cp(
    path.join(extensionSrcDir, "experiments"),
    path.join(extensionDistDir, "experiments"),
    { recursive: true },
  );
}

await rm(extensionDistDir, { recursive: true, force: true });
await mkdir(path.join(extensionDistDir, "companion"), { recursive: true });

await Promise.all([
  esbuild.build({
    ...commonBuildOptions,
    format: "esm",
    entryPoints: [path.join(extensionSrcDir, "background.ts")],
    outfile: path.join(extensionDistDir, "background.js"),
  }),
  esbuild.build({
    ...commonBuildOptions,
    format: "iife",
    entryPoints: [path.join(extensionSrcDir, "companion", "companion.ts")],
    outfile: path.join(extensionDistDir, "companion", "companion.js"),
  }),
  copyStaticAssets(),
]);
