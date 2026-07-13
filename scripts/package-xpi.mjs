import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
const extensionDistDir = path.join(rootDir, "dist", "extension");
const packageDir = path.join(rootDir, "dist");
const outputFile = path.join(packageDir, `meeting-reminder-join-${packageJson.version}.xpi`);

await access(extensionDistDir);
await mkdir(packageDir, { recursive: true });
await rm(outputFile, { force: true });

await new Promise((resolve, reject) => {
  const zip = spawn("zip", ["-r", outputFile, ".", "-x", "*.DS_Store"], {
    cwd: extensionDistDir,
    stdio: "inherit",
  });

  zip.on("error", reject);
  zip.on("close", (code) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`zip exited with code ${code}`));
  });
});

console.log(`Packaged ${path.relative(rootDir, outputFile)}`);
