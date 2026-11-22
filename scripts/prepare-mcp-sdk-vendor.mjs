#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const recipe = join(root, "vendor", "mcp-sdk");
const output = join(root, "packages", "coding-agent", "src", "vendor", "mcp");
const digest = (algorithm, bytes) => createHash(algorithm).update(bytes).digest(algorithm === "sha512" ? "base64" : "hex");

function files(directory) {
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => relative(directory, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
		.sort();
}

function relativeImport(from, to) {
	const specifier = relative(dirname(from), to).replaceAll("\\", "/");
	return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

/** Materialize the audited SDK archives without a registry, install hooks or a new package. */
export function prepareMcpSdkVendor({ check = false } = {}) {
	const manifest = JSON.parse(readFileSync(join(recipe, "manifest.json"), "utf8"));
	assert.equal(digest("sha256", readFileSync(join(recipe, "source.patch"))), manifest.patchSha256);
	assert.equal(digest("sha256", readFileSync(join(recipe, "build.mjs"))), manifest.build.recipeSha256);
	const overlayDirectory = join(recipe, "senpi");
	const overlay = JSON.parse(readFileSync(join(overlayDirectory, "manifest.json"), "utf8"));
	assert.equal(digest("sha256", readFileSync(join(overlayDirectory, "source.patch"))), overlay.patchSha256);
	// Preserve the shared base's provenance even though Senpi uses its overlaid client.
	assert.match(manifest.artifacts.client.file, /^client-[a-f0-9]{16}\.tgz$/);
	const baseClient = readFileSync(join(recipe, manifest.artifacts.client.file));
	assert.equal(baseClient.length, manifest.artifacts.client.bytes);
	assert.equal(`sha512-${digest("sha512", baseClient)}`, manifest.artifacts.client.integrity);
	const scratch = mkdtempSync(join(tmpdir(), "senpi-mcp-sdk-"));
	assert.equal(resolve(dirname(scratch)), resolve(tmpdir()));
	const generated = new Map();
	try {
		for (const name of ["client", "core"]) {
			const artifact = name === "client" ? overlay.artifacts.client : manifest.artifacts[name];
			assert.match(artifact.file, new RegExp(`^${name}-[a-f0-9]{16}\\.tgz$`));
			const archive = join(name === "client" ? overlayDirectory : recipe, artifact.file);
			const bytes = readFileSync(archive);
			assert.equal(bytes.length, artifact.bytes);
			assert.equal(`sha512-${digest("sha512", bytes)}`, artifact.integrity, `SDK archive changed: ${name}`);
			const unpacked = join(scratch, name);
			mkdirSync(unpacked);
			const result = spawnSync("tar", ["-xzf", archive, "-C", unpacked], { encoding: "utf8" });
			assert.equal(result.status, 0, result.stderr || result.error?.message);
			const packageRoot = join(unpacked, "package");
			const packageManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
			assert.equal(packageManifest.name, `@modelcontextprotocol/${name}`);
			assert.equal(packageManifest.version, manifest.build.core);
			for (const file of files(join(packageRoot, "dist"))) {
				if (!file.endsWith(".mjs") && !file.endsWith(".d.mts")) continue;
				const destination = join(output, name, file);
				let source = readFileSync(join(packageRoot, "dist", file), "utf8");
				// Keep the official modules and declarations; only their package resolver
				// edges change. Client and core must use the same schema/symbol instances.
				source = source.replace(/(["'])@modelcontextprotocol\/(core(?:\/[^"']+)?|client\/_shims)\1/g, (_match, quote, specifier) => {
					const target = specifier === "client/_shims"
						? "client/shimsNode.mjs"
						: specifier === "core"
							? "core/index.mjs"
							: specifier === "core/internal"
								? "core/internal.mjs"
								: `${specifier}/index.mjs`;
					return `${quote}${relativeImport(destination, join(output, target))}${quote}`;
				});
				// Senpi does not ship maps whose original TypeScript files are absent.
				source = source.replace(/^\/\/# sourceMappingURL=.*\r?\n?/gm, "");
				generated.set(`${name}/${file}`, source);
			}
			generated.set(`${name}/LICENSE`, readFileSync(join(packageRoot, "LICENSE"), "utf8"));
		}
		if (check) {
			assert.deepEqual(files(output), [...generated.keys()].sort(), "SDK vendor file set changed; regenerate it");
			for (const [file, source] of generated) assert.equal(readFileSync(join(output, file), "utf8"), source, `SDK vendor differs: ${file}`);
		} else {
			// This script owns only its generated directory, never the surrounding source tree.
			assert.equal(resolve(output), resolve(root, "packages/coding-agent/src/vendor/mcp"));
			if (existsSync(output)) rmSync(output, { recursive: true });
			for (const [file, source] of generated) {
				mkdirSync(dirname(join(output, file)), { recursive: true });
				writeFileSync(join(output, file), source);
			}
		}
		console.log(`MCP SDK ${manifest.build.core} + Senpi ${overlay.patchSha256.slice(0, 12)}: ${check ? "verified" : "generated"} ${generated.size} ESM, declaration and license files`);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	assert.ok(process.argv.slice(2).every((argument) => argument === "--check"), "Only --check is supported");
	prepareMcpSdkVendor({ check: process.argv.includes("--check") });
}
