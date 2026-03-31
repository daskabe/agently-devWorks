import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(repoRoot, "apps", "chrome-extension");
const distRoot = path.join(repoRoot, "dist");
const extensionDistDir = path.join(distRoot, "chrome-extension");
const zipPath = path.join(distRoot, "chrome-extension.zip");

async function main() {
  await rm(extensionDistDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });
  await mkdir(distRoot, { recursive: true });

  await cp(sourceDir, extensionDistDir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}dist${path.sep}`)
  });

  const buildInfoPath = path.join(extensionDistDir, "BUILD_INFO.txt");
  await writeFile(
    buildInfoPath,
    [
      "Agently Chrome Extension production build",
      `Built at: ${new Date().toISOString()}`,
      `Source: ${sourceDir}`
    ].join("\n") + "\n",
    "utf8"
  );

  await createZip();

  process.stdout.write(`Built Chrome extension to ${extensionDistDir}\n`);
  process.stdout.write(`Created archive ${zipPath}\n`);
}

async function createZip() {
  const zipExecutable = "zip";

  if (!existsSync("/usr/bin/zip") && !existsSync("/bin/zip")) {
    throw new Error("zip command not found on this system.");
  }

  await execFileAsync(
    zipExecutable,
    ["-r", zipPath, "."],
    { cwd: extensionDistDir }
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
