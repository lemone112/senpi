import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import type { McpServerConfig } from "../../src/core/extensions/builtin/mcp/config-schema.ts";
import { createMcpLogger } from "../../src/core/extensions/builtin/mcp/log.ts";
import {
	connectMcpTransport,
	createMcpTransport,
	shutdownMcpTransport,
} from "../../src/core/extensions/builtin/mcp/transport.ts";

// Protect the configured host connect budget through the native SDK and actual
// child pipes. A full-budget discovery breaks silent legacy; a final legacy
// verdict at the short probe deadline breaks a cold modern process.
it.each([
	["cold modern", { startupDelayMs: 900, initializeErrorCode: -32601 }, "modern"],
	["silent legacy", { discover: "silent", initializeDelayMs: 1000 }, "legacy"],
] as const)("connects %s stdio within the configured budget", async (_name, settings, era) => {
	const root = mkdtempSync(join(tmpdir(), "senpi-stdio-negotiation-"));
	const log = join(root, "wire.jsonl");
	const config: McpServerConfig = {
		type: "stdio",
		command: process.execPath,
		args: [
			fileURLToPath(new URL("../../../../scripts/mcp-stdio.test-support.mjs", import.meta.url)),
			log,
			"SENPI_UNUSED_FIXTURE_ENV",
			"modern",
			JSON.stringify(settings),
		],
		enabled: true,
		exposure: "auto",
		lifecycle: "lazy",
		idleTimeoutMin: 10,
		connectTimeoutMs: 3000,
		requestTimeoutMs: 1000,
		startupTimeoutMs: 250,
		logLevel: "info",
	};
	const connection = createMcpTransport({
		config,
		logger: createMcpLogger("stdio-negotiation", { logDir: root }),
		serverName: "stdio-negotiation",
	});
	try {
		await connectMcpTransport(connection);
		expect(connection.client.getProtocolEra()).toBe(era);
		expect((await connection.client.listTools()).tools).toEqual([]);
		const events = readFileSync(log, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(events.filter((event) => event.kind === "spawn")).toHaveLength(2);
		const initialization = events.find((event) => event.message?.method === "initialize");
		expect(initialization.message.id).toBe(0);
		expect(initialization.message.params._meta).toBeUndefined();
	} finally {
		await shutdownMcpTransport(connection);
		rmSync(root, { recursive: true, force: true });
	}
});
