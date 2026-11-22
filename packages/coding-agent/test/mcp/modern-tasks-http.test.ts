import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import { NativeTasksFixture, startNativeTasks } from "./fixtures/native-tasks.ts";
import { createMcpLogger } from "../../src/core/extensions/builtin/mcp/log.ts";
import { materializeNegotiatedTransport } from "../../src/core/extensions/builtin/mcp/modern/dispatch.ts";
import { callMcpTool } from "../../src/core/extensions/builtin/mcp/expose/call.ts";
import type { McpToolCatalogEntry } from "../../src/core/extensions/builtin/mcp/catalog.ts";
import { ServerConnection } from "../../src/core/extensions/builtin/mcp/connection.ts";

describe("modern tasks HTTP routing", () => {
	it.each(["complete", "abort"] as const)("routes task %s and displays status through the tool row", async (mode) => {
		const id = "work";
		const updates: string[] = [];
		const caller = new AbortController();
		const task = {
			taskId: id,
			status: "working",
			statusMessage: "processing batch",
			createdAt: "2026-07-28T00:00:00Z",
			lastUpdatedAt: "2026-07-28T00:00:00Z",
			ttlMs: null,
			pollIntervalMs: 0,
		};
		const fixture = new NativeTasksFixture();
		fixture.honor = false;
		fixture.get = () => ({ ...task, status: "completed", result: { content: [{ type: "text", text: "done" }] } });
		const server = await startNativeTasks(fixture);
		const logger = createMcpLogger("fixture");
		const materialized = await materializeNegotiatedTransport(
			{
				spec: { kind: "http", url: new URL(server.url), authProvider: undefined, requestInit: undefined },
				logger,
				sink: { logger },
				onStart() {},
				elicitationUiProvider: undefined,
			},
			"fixture",
			5000,
			caller.signal,
		);
		const client = materialized.client;
		await client.connect(materialized.transport);
		const connection = Object.create(ServerConnection.prototype) as ServerConnection;
		Object.defineProperties(connection, {
			client: { value: client },
			state: { value: "connected" },
			generation: { value: 0 },
			onStateChange: { value: () => () => {} },
		});
		const entry: McpToolCatalogEntry = {
			server: "fixture",
			tool: "test",
			schema: { type: "object" },
			connection,
			requestTimeoutMs: 1000,
			// The preflight is outside this test's request contract.
			invocation: {
				identity: () => ({ owner: entry, operation: "fixture", metadata: "fixture" }),
				resolve: async () => ({ kind: "ready", entry, isCurrent: () => true }),
			},
		};
		try {
			const pending = callMcpTool(
				entry,
				{},
				caller.signal,
				(update: AgentToolResult<unknown>) => {
					for (const content of update.content) if (content.type === "text") updates.push(content.text);
					if (mode === "abort") caller.abort();
				},
				"fixture",
				undefined,
			);
			if (mode === "complete") {
				expect(await pending).toMatchObject({
					kind: "called",
					result: { content: [{ type: "text", text: "done" }] },
				});
			} else {
				await expect(pending).rejects.toMatchObject({ code: "MCP_MRTR_CANCELLED" });
			}
			expect(updates).toEqual([expect.stringContaining(`MCP task ${id}: working`)]);
			const followup = fixture.requests.find(
				(r) => r.method === (mode === "complete" ? "tasks/get" : "tasks/cancel"),
			);
			if (!followup) throw new Error("Missing task request");
			expect(followup?.method).toBe(mode === "complete" ? "tasks/get" : "tasks/cancel");
			expect(fixture.headers.get(followup.id)?.get("Mcp-Name")).toBe(id);
			expect(fixture.headers.get(followup.id)?.get("Mcp-Method")).toBe(followup.method);
			expect(followup?.params).toHaveProperty(
				["_meta", "io.modelcontextprotocol/clientCapabilities", "extensions", "io.modelcontextprotocol/tasks"],
				{},
			);
		} finally {
			await materialized.close();
			await server.close();
		}
	});
});
