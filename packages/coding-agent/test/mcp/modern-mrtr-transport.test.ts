import {
	Client,
	StreamableHTTPClientTransport,
	type Transport,
	type JSONRPCRequest,
	type JSONRPCMessage,
} from "../../src/vendor/mcp/client/index.mjs";
import { ResultSchema } from "../../src/vendor/mcp/core/index.mjs";
import { trace } from "@opentelemetry/api";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpLogger } from "../../src/core/extensions/builtin/mcp/log.ts";
import { McpTransportPolicy } from "../../src/core/extensions/builtin/mcp/modern/transport-policy.ts";
import { materializeMcpTransport } from "../../src/core/extensions/builtin/mcp/transport-sdk.ts";
import { MrtrScript } from "./fixtures/mrtr-2026-server.ts";
import { makeRoot } from "./fixtures/service-lifecycle.ts";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const stop of cleanup.splice(0).reverse()) await stop();
	vi.unstubAllGlobals();
});
describe("MRTR transport correlation", () => {
	it("keeps malformed legacy form details out of private protocol errors", async () => {
		const telemetry: unknown[] = [];
		const span = trace.wrapSpanContext({
			traceId: "11111111111111111111111111111111",
			spanId: "1111111111111111",
			traceFlags: 1,
		});
		vi.spyOn(span, "setStatus").mockImplementation((status) => {
			telemetry.push(status);
			return span;
		});
		vi.spyOn(span, "recordException").mockImplementation((exception) => {
			telemetry.push(exception);
		});
		const tracer = vi.spyOn(trace, "getTracer").mockReturnValue({
			startSpan: () => span,
			startActiveSpan: () => {
				throw new Error("Unexpected active span");
			},
		});
		cleanup.push(async () => tracer.mockRestore());
		const root = makeRoot("private-malformed-form", cleanup);
		const receipt = join(root.agentDir, "reply.json");
		const script = `
			const { writeFileSync } = require("node:fs");
			let call;
			const send = message => process.stdout.write(JSON.stringify(message) + "\\n");
			require("node:readline").createInterface({input:process.stdin}).on("line", line => {
				const request = JSON.parse(line);
				if (request.method === "initialize") send({jsonrpc:"2.0",id:request.id,result:{protocolVersion:"2025-11-25",capabilities:{tools:{}},serverInfo:{name:"private",version:"1"}}});
				if (request.method === "tools/call") {
					call = request.id;
					send({jsonrpc:"2.0",id:"private-form",method:"elicitation/create",params:{message:"PRIVATE_BODY_CANARY",requestedSchema:{type:"object",properties:{PRIVATE_FIELD_CANARY:{type:"invalid"}}}}});
				}
				if (request.id === "private-form" && request.error) {
					writeFileSync(process.argv[1],JSON.stringify(request));
					send({jsonrpc:"2.0",id:call,result:{content:[]}});
				}
			});`;
		const logger = createMcpLogger("fixture", { logDir: root.agentDir });
		const materialized = await materializeMcpTransport({
			spec: {
				kind: "stdio",
				command: process.execPath,
				args: ["-e", script, receipt],
				cwd: undefined,
				env: {},
				authProvider: undefined,
			},
			logger,
			sink: { logger },
			onStart() {},
			elicitationUiProvider: Object.assign(() => undefined, { enforced: () => true, eligible: () => true }),
		});
		cleanup.push(materialized.close);
		await materialized.client.connect(materialized.transport);
		await materialized.client.callTool({ name: "fixture" });
		const response = await readFile(receipt, "utf8");
		expect(response).not.toContain("CANARY");
		expect(JSON.parse(response)).toMatchObject({
			error: { code: -32603, message: "Elicitation processing unavailable" },
		});
		expect(telemetry).toContainEqual({ code: 2, message: "Elicitation processing unavailable" });
		expect(JSON.stringify(telemetry)).not.toContain("CANARY");
	});
	it.each([false, true])(
		"preserves complete and trailing stderr when an unclassified child exits (project=%s)",
		async (projectPolicy) => {
			const root = makeRoot("mrtr-stdio-startup-crash", cleanup);
			const logger = createMcpLogger("fixture", { logDir: root.agentDir });
			const spec = {
				kind: "stdio" as const,
				command: process.execPath,
				args: ["-e", 'process.stderr.write("startup failure\\ntrailing diagnostic"); process.exitCode = 1;'],
				cwd: undefined,
				env: {},
				authProvider: undefined,
				projectPolicy,
			};
			const materialized = await materializeMcpTransport({
				spec: { ...spec, resolveBeforeStart: async () => spec },
				logger,
				sink: { logger },
				elicitationUiProvider: undefined,
				onStart: () => {},
			});
			cleanup.push(() => materialized.close());
			const closed = Promise.withResolvers<void>();
			materialized.transport.onclose = () => closed.resolve();
			await materialized.transport.start();
			await closed.promise;
			const diagnostics = logger.getRingBuffer().join("\n");
			expect(diagnostics).toContain("startup failure");
			expect(diagnostics).toContain("trailing diagnostic");
		},
	);
	it.each(["json", "sse"])("a %s HTTP reply cannot settle a different in-flight request", async (encoding) => {
		const replies = new Map<
			string,
			{ request: JSONRPCRequest; reply: ReturnType<typeof Promise.withResolvers<Response>> }
		>();
		vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
			const message = JSON.parse(String(init.body)) as JSONRPCRequest;
			if (message.method === "server/discover") return Response.json(new MrtrScript().reply(message));
			if (!Object.hasOwn(message, "id")) return new Response(null, { status: 202 });
			const reply = Promise.withResolvers<Response>();
			replies.set(String(message.params?.name), { request: message, reply });
			return reply.promise;
		});
		const client = new Client({ name: "fixture", version: "1" }, { versionNegotiation: { mode: "auto" } });
		const policy = new McpTransportPolicy(() => undefined);
		const transport = new StreamableHTTPClientTransport(new URL("https://fixture.invalid/mcp"), {
			fetch: policy.fetch,
		});
		policy.attach(transport, client);
		cleanup.push(() => client.close());
		await client.connect(transport);
		const first = client.request({ method: "tools/call", params: { name: "first" } }, ResultSchema);
		const failure = expect(first).rejects.toThrow("MCP response identifier mismatch");
		const second = client.request({ method: "tools/call", params: { name: "second" } }, ResultSchema);
		let secondSettled = false;
		void second.then(() => {
			secondSettled = true;
		});
		await vi.waitFor(() => expect(replies.size).toBe(2));
		const firstReply = replies.get("first");
		const secondReply = replies.get("second");
		if (!firstReply || !secondReply) throw new Error("Missing fixture requests");
		const wrong = {
			jsonrpc: "2.0",
			id: secondReply.request.id,
			result: { resultType: "complete", content: [] },
		};
		const response = (message: unknown) =>
			encoding === "json"
				? Response.json(message)
				: new Response(`data: ${JSON.stringify(message)}\n\n`, {
						headers: { "Content-Type": "text/event-stream" },
					});
		firstReply.reply.resolve(response(wrong));
		await failure;
		expect(secondSettled).toBe(false);
		secondReply.reply.resolve(
			response({ ...wrong, result: { resultType: "complete", content: [{ type: "text", text: "real" }] } }),
		);
		expect(await second).toHaveProperty(["content", 0, "text"], "real");
	});

	it("SDK cancellation targets only the live request and ignores its later response and progress", async () => {
		const sent: JSONRPCMessage[] = [];
		const script = new MrtrScript();
		const transport: Transport = {
			async start() {},
			async close() {
				transport.onclose?.();
			},
			async send(message) {
				sent.push(message);
				if ("method" in message && message.method === "server/discover" && "id" in message)
					transport.onmessage?.(script.reply(message) as JSONRPCMessage);
			},
		};
		const client = new Client({ name: "fixture", version: "1" }, { versionNegotiation: { mode: "auto" } });
		new McpTransportPolicy(() => undefined).attach(transport, client);
		cleanup.push(() => client.close());
		await client.connect(transport);
		const progress: unknown[] = [];
		const firstAbort = new AbortController();
		const first = client.request({ method: "tools/call", params: { name: "first" } }, ResultSchema, {
			signal: firstAbort.signal,
		});
		await vi.waitFor(() => expect(sent.some((m) => "method" in m && m.method === "tools/call")).toBe(true));
		const firstMessage = sent.find((m) => "method" in m && m.method === "tools/call") as JSONRPCRequest;
		transport.onmessage?.({ jsonrpc: "2.0", id: firstMessage.id, result: { resultType: "complete", content: [] } });
		await first;
		firstAbort.abort();
		const secondAbort = new AbortController();
		const second = client.request({ method: "tools/call", params: { name: "second" } }, ResultSchema, {
			signal: secondAbort.signal,
			onprogress: (value) => progress.push(value),
		});
		const rejected = expect(second).rejects.toThrow();
		await vi.waitFor(() => expect(sent.filter((m) => "method" in m && m.method === "tools/call")).toHaveLength(2));
		const secondMessage = sent.filter((m) => "method" in m && m.method === "tools/call")[1] as JSONRPCRequest;
		const emit = () =>
			transport.onmessage?.({
				jsonrpc: "2.0",
				method: "notifications/progress",
				params: {
					progressToken: secondMessage.params?._meta?.progressToken,
					progress: 1,
					message: "PRIVATE_CANARY",
				},
			});
		emit();
		await vi.waitFor(() => expect(progress).toHaveLength(1));
		secondAbort.abort();
		secondAbort.abort();
		await rejected;
		transport.onmessage?.({ jsonrpc: "2.0", id: secondMessage.id, result: { resultType: "complete", content: [] } });
		emit();
		expect(sent.filter((m) => "method" in m && m.method === "notifications/cancelled")).toEqual([
			expect.objectContaining({ params: expect.objectContaining({ requestId: secondMessage.id }) }),
		]);
		expect(progress).toEqual([{ progress: 1 }]);
	});
});
