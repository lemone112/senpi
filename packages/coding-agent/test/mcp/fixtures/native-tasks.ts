import { createServer, type ServerResponse } from "node:http";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { JSONRPCMessage, JSONRPCRequest } from "../../../src/vendor/mcp/client/index.mjs";

export const taskSnapshot = (taskId: string, status = "working", fields: Record<string, unknown> = {}) => ({
	taskId,
	status,
	createdAt: "2026-11-22T00:00:00Z",
	lastUpdatedAt: "2026-11-22T00:00:01Z",
	ttlMs: null,
	pollIntervalMs: 1,
	...fields,
});
export const finalTask = (id: string) =>
	taskSnapshot(id, "completed", { result: { content: [{ type: "text", text: `result-${id}` }] } });

export class NativeTasksFixture {
	readonly requests: JSONRPCRequest[] = [];
	readonly headers = new Map<string | number, Headers>();
	readonly streams = new Map<string | number, { ids: string[]; send(message: JSONRPCMessage): void; end(): void }>();
	honor: boolean | string[] = true;
	rejectTask?: string;
	capabilities: Record<string, unknown> = {
		tools: { listChanged: true },
		extensions: { "io.modelcontextprotocol/tasks": {} },
	};
	resources: Array<{ uri: string; name: string }> = [];
	beforeReply?: (request: JSONRPCRequest) => void | Promise<void>;
	beforeGet?: (request: JSONRPCRequest) => void | Promise<void>;
	get = (id: string) => taskSnapshot(id);
	reply(request: JSONRPCRequest): JSONRPCMessage {
		this.requests.push(request);
		let result: Record<string, unknown> = { resultType: "complete" };
		if (request.method === "server/discover")
			result = {
				...result,
				supportedVersions: ["2026-07-28"],
				capabilities: this.capabilities,
				_meta: { "io.modelcontextprotocol/serverInfo": { name: "native-fixture", version: "1" } },
			};
		if (request.method === "tools/list")
			result = {
				...result,
				ttlMs: 0,
				cacheScope: "private",
				tools: [{ name: "fixture", inputSchema: { type: "object" } }],
			};
		if (request.method === "resources/list")
			result = { ...result, ttlMs: 0, cacheScope: "private", resources: this.resources };
		if (request.method === "tools/call")
			result = {
				resultType: "task",
				...taskSnapshot(
					String(
						(request.params?.arguments && (request.params.arguments as Record<string, unknown>).id) || "work",
					),
				),
			};
		if (request.method === "tasks/get") result = { ...result, ...this.get(String(request.params?.taskId)) };
		return { jsonrpc: "2.0", id: request.id, result };
	}
	listen(request: JSONRPCRequest, send: (message: JSONRPCMessage) => void, end: () => void): void {
		this.requests.push(request);
		const filter = request.params?.notifications as {
			taskIds?: string[];
			toolsListChanged?: boolean;
			resourcesListChanged?: boolean;
			resourceSubscriptions?: string[];
		};
		const allowed = this.honor;
		const ids = (filter.taskIds ?? []).filter((id) => (Array.isArray(allowed) ? allowed.includes(id) : allowed));
		if (this.rejectTask && ids.includes(this.rejectTask)) {
			send({ jsonrpc: "2.0", id: request.id, error: { code: -32602, message: "subscription unavailable" } });
			end();
			return;
		}
		this.streams.set(request.id, { ids, send, end });
		send({
			jsonrpc: "2.0",
			method: "notifications/subscriptions/acknowledged",
			params: {
				_meta: { "io.modelcontextprotocol/subscriptionId": request.id },
				notifications: { ...filter, taskIds: ids },
			},
		});
	}
	push(task: ReturnType<typeof taskSnapshot>): void {
		for (const [id, stream] of this.streams)
			if (stream.ids.includes(task.taskId))
				stream.send({
					jsonrpc: "2.0",
					method: "notifications/tasks",
					params: { ...task, _meta: { "io.modelcontextprotocol/subscriptionId": id } },
				});
	}
	end(): void {
		for (const stream of this.streams.values()) stream.end();
	}
	notify(method: string, params: Record<string, unknown> = {}): void {
		for (const [id, stream] of this.streams)
			stream.send({
				jsonrpc: "2.0",
				method,
				params: { ...params, _meta: { "io.modelcontextprotocol/subscriptionId": id } },
			});
	}
}

export async function startNativeTasks(fixture: NativeTasksFixture) {
	const responses = new Set<ServerResponse>();
	const server = createServer(async (request, response) => {
		if (request.method !== "POST") {
			response.writeHead(405).end();
			return;
		}
		const chunks: Buffer[] = [];
		for await (const chunk of request) chunks.push(Buffer.from(chunk));
		const message = JSON.parse(Buffer.concat(chunks).toString()) as JSONRPCRequest;
		fixture.headers.set(message.id, new Headers(request.headers as Record<string, string>));
		if (message.method === "subscriptions/listen") {
			response.writeHead(200, { "Content-Type": "text/event-stream" });
			responses.add(response);
			response.on("close", () => {
				responses.delete(response);
				fixture.streams.delete(message.id);
			});
			fixture.listen(
				message,
				(event) => response.write(`data: ${JSON.stringify(event)}\n\n`),
				() => response.end(),
			);
			return;
		}
		if (message.method === "tasks/get") await fixture.beforeGet?.(message);
		const reply = fixture.reply(message);
		await fixture.beforeReply?.(message);
		response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(reply));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No fixture address");
	return {
		url: `http://127.0.0.1:${address.port}/mcp`,
		close: () =>
			new Promise<void>((resolve, reject) => {
				for (const response of responses) response.destroy();
				server.closeAllConnections();
				server.close((error) => (error ? reject(error) : resolve()));
			}),
	};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const fixture = new NativeTasksFixture();
	const write = (message: JSONRPCMessage) => process.stdout.write(`${JSON.stringify(message)}\n`);
	createInterface({ input: process.stdin }).on("line", (line) => {
		const request = JSON.parse(line) as JSONRPCRequest;
		if (request.method === "subscriptions/listen") {
			fixture.listen(request, write, () => {});
			return;
		}
		if (request.method === "notifications/cancelled") {
			fixture.streams.delete(request.params?.requestId as string);
			return;
		}
		if (request.method === "tasks/get") fixture.push(finalTask(String(request.params?.taskId)));
		write(fixture.reply(request));
	});
}
