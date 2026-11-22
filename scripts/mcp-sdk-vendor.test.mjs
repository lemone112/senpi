#!/usr/bin/env node

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { copyMcpSdkVendor } from "./copy-mcp-sdk-vendor.mjs";
import { prepareMcpSdkVendor } from "./prepare-mcp-sdk-vendor.mjs";

// The package contract is the reviewed SDK bytes and declarations, including the
// listen patch. Ordinary MCP runtime tests cannot detect a stale archive or a
// declaration omitted from the unbundled distribution.
test("the internal MCP SDK is reproducible from its pinned, audited archives", () => {
	prepareMcpSdkVendor({ check: true });
});

test("unbundled MCP entries resolve locally and require only Senpi's declared dependencies", async () => {
	const scratch = mkdtempSync(join(tmpdir(), "senpi-mcp-assets-"));
	try {
		const source = join(import.meta.dirname, "../packages/coding-agent/src/vendor/mcp");
		cpSync(source, join(scratch, "packages/coding-agent/src/vendor/mcp"), { recursive: true });
		copyMcpSdkVendor(scratch);
		const output = join(scratch, "packages/coding-agent/dist/vendor/mcp");
		const result = await build({
			entryPoints: ["client/index.mjs", "client/stdio.mjs", "core/index.mjs"].map((file) => join(output, file)),
			bundle: true,
			write: false,
			outdir: join(scratch, "bundled"),
			packages: "external",
			platform: "node",
			format: "esm",
			metafile: true,
			tsconfigRaw: { compilerOptions: {} },
		});
		const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "../packages/coding-agent/package.json"), "utf8"));
		const imports = Object.values(result.metafile.inputs).flatMap((input) => input.imports).filter((entry) => entry.external);
		assert.ok(imports.length > 0, "The consumer graph must expose its registry dependencies");
		for (const imported of imports) {
			if (isBuiltin(imported.path)) continue;
			const name = imported.path.split("/").slice(0, imported.path.startsWith("@") ? 2 : 1).join("/");
			assert.ok(manifest.dependencies[name], `Undeclared MCP dependency: ${name}`);
			assert.ok(!name.startsWith("@modelcontextprotocol/"), `SDK module escaped internal vendor: ${name}`);
		}
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
});
