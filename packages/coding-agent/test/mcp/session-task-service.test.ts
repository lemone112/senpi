import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionToolContext } from "../../src/core/extensions/types.ts";
import { McpService } from "../../src/core/extensions/builtin/mcp/service.ts";
import { registerDispatchAuthorizer } from "../../src/core/extensions/builtin/permission-system/dispatch.ts";
import { MrtrScript, startMrtrServer } from "./fixtures/mrtr-2026-server.ts";
import { capturingPi, registeredTool, testContext, textContent } from "./fixtures/register-call.ts";
import { makeRoot, setConfig } from "./fixtures/service-lifecycle.ts";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const stop of cleanup.splice(0).reverse()) await stop();
	vi.restoreAllMocks();
});

describe("session task acceptance at the MCP service boundary", () => {
	it.each([
		{ persistent: false, resultKind: "valid" },
		{ persistent: true, resultKind: "valid" },
		{ persistent: true, resultKind: "invalid schema" },
		{ persistent: true, resultKind: "invalid content" },
		{ persistent: true, resultKind: "missing result" },
		{ persistent: true, resultKind: "read failure" },
	])("handles $resultKind with a persistent session file: $persistent", async ({ persistent, resultKind }) => {
		const root = makeRoot("session-task-service", cleanup);
		const task = {
			resultType: "task",
			taskId: "service-task",
			status: "working",
			createdAt: "2026-11-21T00:00:00Z",
			lastUpdatedAt: "2026-11-21T00:00:00Z",
			ttlMs: null,
			pollIntervalMs: 1,
		};
		const script = new MrtrScript([task]);
		if (resultKind === "invalid schema") script.outputSchema = { type: "object", required: ["answer"] };
		let reads = 0;
		const originalReply = script.reply.bind(script);
		vi.spyOn(script, "reply").mockImplementation((request) => {
			if (request.method === "tasks/get") {
				script.requests.push(request);
				if (++reads === 1 && resultKind === "read failure")
					return { jsonrpc: "2.0", id: request.id, error: { code: -32603, message: "temporary read failure" } };
				return {
					jsonrpc: "2.0",
					id: request.id,
					result: {
						...task,
						resultType: "complete",
						status: "completed",
						result:
							resultKind === "missing result"
								? undefined
								: {
										content: [
											{ type: "text", text: resultKind === "invalid content" ? 42 : "service final output" },
										],
									},
					},
				};
			}
			const reply = originalReply(request);
			if (request.method === "server/discover") {
				const result = reply.result as { capabilities: Record<string, unknown> };
				result.capabilities.extensions = { "io.modelcontextprotocol/tasks": {} };
			}
			return reply;
		});
		const server = await startMrtrServer(script);
		cleanup.push(server.close);
		setConfig(root, {
			fixture: { type: "http", url: server.url, auth: false, exposure: "direct", requestTimeoutMs: 1000 },
		});
		const service = new McpService();
		cleanup.push(() => service.dispose("quit"));
		const entries: unknown[] = [];
		const emitted: string[] = [];
		const persist = vi.fn(async () => {});
		const admit = vi.fn((input: { delivery_id: string }) => {
			// Production admission records this in the same session history.
			emitted.push(input.delivery_id);
			return { kind: "queued", turn_epoch: 1 };
		});
		const pi = Object.assign(capturingPi(), {
			appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
			session: {
				persistHeaderNow: persist,
				listAdmittedDeliveries: () => ({ pending: [], emitted }),
				admitExternalMessage: admit,
			},
			lifecycle: { obligations: { open: () => ({ close: () => {} }) } },
		}) as unknown as ReturnType<typeof capturingPi> & Pick<ExtensionAPI, "appendEntry" | "session" | "lifecycle">;
		const sessionManager = {
			getSessionId: () => "service-session",
			getSessionFile: () => (persistent ? `${root.cwd}/session.jsonl` : undefined),
			getEntries: () => entries as never[],
		};
		const retire = registerDispatchAuthorizer(sessionManager, {
			policy: () => ({ action: "allow", fingerprint: "test-policy" }),
			ask: async () => {
				throw new Error("unexpected permission prompt");
			},
		});
		cleanup.push(async () => retire());
		await service.attachSession(
			{ type: "session_start", reason: "startup" },
			{
				cwd: root.cwd,
				mode: "rpc",
				isProjectTrusted: () => true,
				sessionManager,
			},
			pi,
			{ agentDir: root.agentDir },
		);
		expect(await service.whenAttachSettled(10000)).toBe("settled");
		const connection = service.getConnection("fixture");
		if (!connection) throw new Error("missing fixture connection");

		const toolName = [...pi.toolDefinitions.keys()].find((name) => name === "mcp_fixture_fixture");
		if (!toolName) throw new Error("missing fixture tool");
		const result = await registeredTool(pi, toolName).execute("call", {}, undefined, undefined, {
			...testContext(),
			sessionManager,
			tools: [...pi.toolDefinitions.values()],
		} as unknown as ExtensionToolContext);
		if (persistent) {
			expect(textContent(result)).toContain("accepted");
			expect(persist).toHaveBeenCalledOnce();
			if (resultKind === "read failure") {
				await vi.waitFor(() => expect(reads).toBe(1));
				expect(admit).not.toHaveBeenCalled();
			}
			await vi.waitFor(() => expect(admit).toHaveBeenCalledOnce(), { timeout: 5000 });
			expect(admit.mock.calls[0][0]).toMatchObject({ text: expect.stringContaining("service-task") });
			expect(admit.mock.calls[0][0]).toMatchObject({
				text: expect.stringContaining(
					resultKind === "invalid schema"
						? "MCP_OUTPUT_SCHEMA_MISMATCH"
						: resultKind === "invalid content"
							? "MCP_MRTR_INVALID_RESULT"
							: resultKind === "missing result"
								? "Task completed, but its final result is invalid"
								: "service final output",
				),
			});
			expect(reads).toBe(resultKind === "read failure" ? 2 : 1);
		} else {
			expect(textContent(result)).toContain("service final output");
			expect(persist).not.toHaveBeenCalled();
			expect(admit).not.toHaveBeenCalled();
		}
		expect(script.requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
	});
});
