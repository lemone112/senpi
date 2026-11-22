#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Keep unbundled consumers on the exact SDK modules compiled into the CLI. */
export function copyMcpSdkVendor(repoRoot = root) {
	const source = join(repoRoot, "packages/coding-agent/src/vendor/mcp");
	const destination = join(repoRoot, "packages/coding-agent/dist/vendor/mcp");
	if (!existsSync(join(source, "client/index.mjs")) || !existsSync(join(source, "core/internal.mjs"))) {
		throw new Error("Missing MCP SDK vendor files; run node scripts/prepare-mcp-sdk-vendor.mjs");
	}
	rmSync(destination, { recursive: true, force: true });
	mkdirSync(destination, { recursive: true });
	cpSync(source, destination, { recursive: true });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) copyMcpSdkVendor();
