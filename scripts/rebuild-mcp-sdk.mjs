#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Maintainer verification only. Neither the build nor npm install runs this.
const root = fileURLToPath(new URL("../", import.meta.url));
const recipe = join(root, "vendor/mcp-sdk");
const manifest = JSON.parse(readFileSync(join(recipe, "manifest.json"), "utf8"));
const arguments_ = process.argv.slice(2);
assert.ok(arguments_.every((argument) => argument === "--base" || argument === "--write"), "Usage: node scripts/rebuild-mcp-sdk.mjs [--base | --write]");
const base = arguments_.includes("--base");
const write = arguments_.includes("--write");
assert.ok(!(base && write), "The shared base artifacts cannot be rewritten here");
const overlayDirectory = join(recipe, "senpi");
const overlay = base ? undefined : JSON.parse(readFileSync(join(overlayDirectory, "manifest.json"), "utf8"));
assert.equal(manifest.source.repository, "https://github.com/modelcontextprotocol/typescript-sdk.git");
assert.match(manifest.source.revision, /^[a-f0-9]{40}$/);
assert.match(manifest.build.image, /^node:[^\s]+@sha256:[a-f0-9]{64}$/);
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
assert.equal(sha256(join(recipe, "source.patch")), manifest.patchSha256);
assert.equal(sha256(join(recipe, "build.mjs")), manifest.build.recipeSha256);
if (overlay) assert.equal(sha256(join(overlayDirectory, "source.patch")), overlay.patchSha256);
const scratch = mkdtempSync(join(tmpdir(), "senpi-mcp-rebuild-"));
assert.equal(resolve(dirname(scratch)), resolve(tmpdir()));
const source = join(scratch, "source");
const output = join(scratch, "output");
const run = (command, args, cwd = root) => {
	const result = spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
	assert.equal(result.status, 0, `${command} failed: ${result.error?.message ?? result.status}`);
};
try {
	mkdirSync(source);
	mkdirSync(output);
	run("git", ["init", "--quiet", source]);
	run("git", ["config", "core.autocrlf", "false"], source);
	run("git", ["fetch", "--quiet", "--depth=1", manifest.source.repository, manifest.source.revision], source);
	run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], source);
	run("git", ["apply", "--check", join(recipe, "source.patch")], source);
	run("git", ["apply", join(recipe, "source.patch")], source);
	if (overlay) {
		run("git", ["apply", "--check", join(overlayDirectory, "source.patch")], source);
		run("git", ["apply", join(overlayDirectory, "source.patch")], source);
	}
	rmSync(join(source, ".git"), { recursive: true });
	run("docker", ["run", "--rm", "--init",
		"--mount", `type=bind,source=${source},target=/input,readonly`,
		"--mount", `type=bind,source=${recipe},target=/recipe,readonly`,
		"--mount", `type=bind,source=${output},target=/output`,
		"--env", `MCP_SDK_PATCH_SHA256=${manifest.patchSha256}`,
		"--env", "COREPACK_ENABLE_DOWNLOAD_PROMPT=0", manifest.build.image,
		"sh", "-euc", "corepack enable; cp -a /input /sdk; cd /sdk; pnpm install --frozen-lockfile --ignore-scripts --filter @modelcontextprotocol/client... --filter @modelcontextprotocol/server...; node /recipe/build.mjs",
	]);
	const build = JSON.parse(readFileSync(join(output, "build.json"), "utf8"));
	for (const [key, value] of Object.entries(build)) assert.equal(value, manifest.build[key], `Build input differs: ${key}`);
	for (const name of ["core", "client"]) {
		const bytes = readFileSync(join(output, `${name}.tgz`));
		const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
		if (overlay && name === "client" && write) {
			const file = `client-${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.tgz`;
			writeFileSync(join(overlayDirectory, file), bytes);
			overlay.artifacts.client = { file, bytes: bytes.length, integrity };
			writeFileSync(join(overlayDirectory, "manifest.json"), `${JSON.stringify(overlay, null, 2)}\n`);
		} else {
			const artifact = overlay && name === "client" ? overlay.artifacts.client : manifest.artifacts[name];
			assert.equal(bytes.length, artifact.bytes);
			assert.equal(integrity, artifact.integrity, `Rebuilt SDK differs: ${name}`);
		}
	}
	console.log(`${write ? "Generated" : "Reproduced"} MCP SDK ${manifest.build.core}${overlay ? ` with Senpi overlay ${overlay.patchSha256}` : " shared base"} client and core archives from source`);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
