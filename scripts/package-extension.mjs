#!/usr/bin/env node
// Package the built Chrome extension into a versioned zip ready for a GitHub Release.
//
// Output: release/clickup-daily-update-extension-<version>.zip
//
// The version comes from extension/manifest.json. Run after `npm run build:extension`.

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const extDir = resolve(repoRoot, "extension");
const releaseDir = resolve(repoRoot, "release");

const manifest = JSON.parse(
  readFileSync(resolve(extDir, "manifest.json"), "utf8")
);
const version = manifest.version;
if (!version) {
  console.error("manifest.json is missing a version");
  process.exit(1);
}

const stageName = `clickup-daily-update-extension-${version}`;
const stageDir = resolve(releaseDir, stageName);
const zipPath = resolve(releaseDir, `${stageName}.zip`);

if (existsSync(stageDir)) rmSync(stageDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);
mkdirSync(stageDir, { recursive: true });

// rsync gives us simple include/exclude semantics and is on every macOS/Linux runner.
// We ship only what Chrome needs at runtime: manifest + compiled JS + html/css + README.
const rsyncCmd = [
  "rsync -a",
  // Allow these
  '--include="manifest.json"',
  '--include="README.md"',
  '--include="popup/"',
  '--include="popup/popup.html"',
  '--include="popup/popup.css"',
  '--include="popup/popup.js"',
  '--include="options/"',
  '--include="options/options.html"',
  '--include="options/options.js"',
  '--include="lib/"',
  '--include="lib/*.js"',
  // Exclude everything else
  '--exclude="*"',
  `"${extDir}/"`,
  `"${stageDir}/"`,
].join(" ");

execSync(rsyncCmd, { stdio: "inherit", shell: "/bin/bash" });

// Zip the staged dir. `cd` into release so the archive contains a clean top-level folder.
execSync(`cd "${releaseDir}" && zip -r "${stageName}.zip" "${stageName}"`, {
  stdio: "inherit",
  shell: "/bin/bash",
});

// Tidy: remove staging dir, keep the zip.
rmSync(stageDir, { recursive: true });

console.log(`\n✅ Built ${zipPath}`);
