import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { mcpSubscriptions } from "../../src/core/extensions/builtin/mcp/modern/sdk-subscriptions.ts";
import { createMcpRequestOrigin, mcpRequestOptions } from "../../src/core/extensions/builtin/mcp/request-origin.ts";
import { materializeNegotiatedTransport } from "../../src/core/extensions/builtin/mcp/modern/dispatch.ts";
import { createMcpLogger } from "../../src/core/extensions/builtin/mcp/log.ts";
import { mcpElapsedClock } from "../../src/core/extensions/builtin/mcp/wrap.ts";
import { McpMrtrError } from "../../src/core/extensions/builtin/mcp/modern/errors.ts";
import { ServerConnection } from "../../src/core/extensions/builtin/mcp/connection.ts";
import {
	registerMcpNotificationHandler,
	ToolListChangedNotificationSchema,
	ResourceUpdatedNotificationSchema,
} from "../../src/core/extensions/builtin/mcp/notification-schemas.ts";
import { ResultSchema } from "../../src/vendor/mcp/core/index.mjs";
import { NativeTasksFixture, startNativeTasks, taskSnapshot, finalTask } from "./fixtures/native-tasks.ts";
import { makeRoot } from "./fixtures/service-lifecycle.ts";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const stop of cleanup.splice(0).reverse()) await stop();
	vi.restoreAllMocks();
});
async function connect(mode: "http" | "stdio" = "http", configure?: (fixture: NativeTasksFixture) => void) {
	const fixture = new NativeTasksFixture();
	configure?.(fixture);
	const server = await startNativeTasks(fixture);
	cleanup.push(server.close);
	const root = makeRoot("native-task-subscriptions", cleanup);
	const logger = createMcpLogger("fixture", { logDir: root.agentDir });
	const materialized = await materializeNegotiatedTransport(
		{
			spec:
				mode === "http"
					? { kind: "http", url: new URL(server.url), authProvider: undefined, requestInit: undefined }
					: {
							kind: "stdio",
							command: process.execPath,
							args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/native-tasks.ts", import.meta.url))],
							env: {},
							cwd: undefined,
							authProvider: undefined,
						},
			logger,
			sink: { logger },
			onStart() {},
			elicitationUiProvider: undefined,
		},
		"fixture",
		5000,
		new AbortController().signal,
	);
	cleanup.push(materialized.close);
	await materialized.client.connect(materialized.transport);
	const client = materialized.client;
	const connection = Object.create(ServerConnection.prototype) as ServerConnection;
	Object.defineProperties(connection, {
		client: { value: client },
		state: { value: "connected" },
		generation: { value: 0 },
		onStateChange: { value: () => () => {} },
	});
	const lifetime = new AbortController();
	cleanup.push(async () => lifetime.abort());
	const observe = (
		id: string,
		signal = lifetime.signal,
		resolveAuthority = async (): Promise<string | null> => null,
	) =>
		client.request(
			{ method: "tasks/get", params: { taskId: id } },
			ResultSchema,
			mcpRequestOptions(
				createMcpRequestOrigin({
					connection,
					binding: {},
					signal: lifetime.signal,
					observingTaskId: id,
					serverLabel: "fixture",
					isCurrent: () => true,
					resolveAuthority,
				}),
				{ signal, timeout: 1000 },
			),
		);
	return { fixture, client, observe, lifetime, connection };
}

it("rejects revoked authority before dispatching the first task subscription", async () => {
	const f = await connect("http", (fixture) => {
		fixture.capabilities.tools = {};
	});
	await expect(
		f.observe("revoked", f.lifetime.signal, async () => {
			throw new McpMrtrError("MCP_MRTR_CONTEXT_CHANGED");
		}),
	).rejects.toMatchObject({ code: "MCP_MRTR_CONTEXT_CHANGED" });
	expect(f.fixture.requests.filter((request) => request.method === "subscriptions/listen")).toHaveLength(0);
	expect(f.fixture.requests.filter((request) => request.method === "tasks/get")).toHaveLength(0);
});

it("revalidates existing task authority before replacing its shared subscription", async () => {
	const f = await connect("http", (fixture) => {
		fixture.capabilities.tools = {};
	});
	let revoked = false;
	const observed = f.observe("a", f.lifetime.signal, async () => {
		if (revoked) throw new McpMrtrError("MCP_MRTR_CONTEXT_CHANGED");
		return "current";
	});
	const stopped = expect(observed).rejects.toMatchObject({ code: "MCP_MRTR_CONTEXT_CHANGED" });
	await vi.waitFor(() => expect(f.fixture.requests.some((request) => request.method === "tasks/get")).toBe(true));
	const after = f.fixture.requests.length;
	revoked = true;
	const other = f.observe("b");
	await vi.waitFor(() =>
		expect(f.fixture.requests.filter((request) => request.method === "tasks/get")).toHaveLength(2),
	);
	f.fixture.push(finalTask("b"));
	expect(await other).toMatchObject({ content: [{ text: "result-b" }] });
	await stopped;
	const replacements = f.fixture.requests.slice(after).filter((request) => request.method === "subscriptions/listen");
	expect(replacements.length).toBeGreaterThan(0);
	for (const request of replacements) {
		const filter = request.params?.notifications as { taskIds?: string[] } | undefined;
		expect(filter?.taskIds ?? []).not.toContain("a");
	}
	expect(f.fixture.requests.filter((request) => request.method === "tasks/cancel")).toHaveLength(0);
});

it.each(["http", "stdio"] as const)(
	"%s retains terminal notification received before the bootstrap response",
	async (mode) => {
		const f = await connect(mode);
		if (mode === "http") f.fixture.beforeGet = (request) => f.fixture.push(finalTask(String(request.params?.taskId)));
		expect(await f.observe("a")).toMatchObject({ content: [{ text: "result-a" }] });
		if (mode === "http") {
			expect(f.fixture.requests.filter((r) => r.method === "tasks/get")).toHaveLength(1);
			const listen = f.fixture.requests.findIndex(
				(r) =>
					r.method === "subscriptions/listen" &&
					(r.params?.notifications as { taskIds?: string[] } | undefined)?.taskIds?.includes("a"),
			);
			expect(listen).toBeLessThan(f.fixture.requests.findIndex((r) => r.method === "tasks/get"));
		}
	},
);

it("shares Tasks with catalog/resource delivery and publishes only the newest completed resource list", async () => {
	const f = await connect("http", (fixture) => {
		fixture.capabilities.resources = { listChanged: true, subscribe: true };
	});
	const resources = vi.fn();
	const catalogs = vi.fn();
	registerMcpNotificationHandler(f.client, ResourceUpdatedNotificationSchema, resources);
	registerMcpNotificationHandler(f.client, ToolListChangedNotificationSchema, catalogs);
	const release = Promise.withResolvers<void>();
	const requested = Promise.withResolvers<void>();
	let first = true;
	f.fixture.resources = [{ uri: "test://old", name: "old" }];
	f.fixture.beforeReply = async (request) => {
		if (request.method === "resources/list" && first) {
			first = false;
			requested.resolve();
			await release.promise;
		}
	};
	const older = f.client.listResources();
	await requested.promise;
	f.fixture.resources = [{ uri: "test://new", name: "new" }];
	await f.client.listResources();
	release.resolve();
	await older;
	const pending = f.observe("mixed");
	await vi.waitFor(() => expect(f.fixture.requests.some((r) => r.method === "tasks/get")).toBe(true));
	const latest = f.fixture.requests.filter((r) => r.method === "subscriptions/listen").at(-1)?.params?.notifications;
	expect(latest).toMatchObject({ taskIds: ["mixed"], toolsListChanged: true, resourceSubscriptions: ["test://new"] });
	f.fixture.notify("notifications/resources/updated", { uri: "test://old" });
	f.fixture.notify("notifications/resources/updated", { uri: "test://new" });
	f.fixture.notify("notifications/tools/list_changed");
	f.fixture.push(finalTask("mixed"));
	await pending;
	expect(resources).toHaveBeenCalledTimes(1);
	expect(resources).toHaveBeenCalledWith(
		expect.objectContaining({ params: expect.objectContaining({ uri: "test://new" }) }),
	);
	expect(catalogs).toHaveBeenCalledTimes(1);
	expect(f.fixture.requests.filter((r) => r.method === "tasks/get")).toHaveLength(1);
});

it("nine live observers receive pushed results with one bootstrap each and no recurring reads", async () => {
	const f = await connect();
	const ids = Array.from({ length: 9 }, (_, n) => `task-${n}`);
	const results = ids.map((id) => f.observe(id));
	await vi.waitFor(() => expect(f.fixture.requests.filter((r) => r.method === "tasks/get")).toHaveLength(9));
	for (const id of ids) f.fixture.push(finalTask(id));
	expect(await Promise.all(results)).toHaveLength(9);
	expect(f.fixture.requests.filter((r) => r.method === "tasks/get")).toHaveLength(9);
	expect(f.fixture.requests.filter((r) => r.method === "tasks/cancel")).toHaveLength(0);
});

it("detaching A preserves B's subscription and never cancels accepted work", async () => {
	const f = await connect();
	const abort = new AbortController();
	const a = f.observe("a", abort.signal);
	const failed = expect(a).rejects.toMatchObject({ code: "MCP_MRTR_CANCELLED" });
	const b = f.observe("b");
	await vi.waitFor(() => expect(f.fixture.requests.filter((r) => r.method === "tasks/get")).toHaveLength(2));
	abort.abort();
	await failed;
	await vi.waitFor(() =>
		expect([...f.fixture.streams.values()].some((stream) => stream.ids.includes("b"))).toBe(true),
	);
	f.fixture.push(finalTask("b"));
	expect(await b).toMatchObject({ content: [{ text: "result-b" }] });
	expect(f.fixture.requests.filter((r) => r.method === "tasks/cancel")).toHaveLength(0);
});

it("an explicit unhonored ID falls back to snapshots while EOF remains an observation failure", async () => {
	const f = await connect();
	f.fixture.honor = false;
	let gets = 0;
	f.fixture.get = (id) => (++gets === 1 ? taskSnapshot(id) : finalTask(id));
	expect(await f.observe("poll")).toMatchObject({ content: [{ text: "result-poll" }] });
	expect(gets).toBe(2);
	f.fixture.honor = true;
	f.fixture.get = (id) => taskSnapshot(id);
	const pending = f.observe("eof");
	const failed = expect(pending).rejects.toMatchObject({ code: "MCP_MRTR_TRANSPORT_FAILED" });
	await vi.waitFor(() =>
		expect(f.fixture.requests.some((r) => r.method === "tasks/get" && r.params?.taskId === "eof")).toBe(true),
	);
	f.fixture.end();
	await failed;
	expect(f.fixture.requests.filter((r) => r.method === "tasks/get" && r.params?.taskId === "eof")).toHaveLength(1);
});

it("queues consecutive task notifications while asynchronous processing resumes", async () => {
	const f = await connect();
	const subscription = mcpSubscriptions(f.client).watchTask("queued", f.lifetime.signal);
	expect(await subscription.ready).toBe(true);
	const next = subscription.next(f.lifetime.signal);
	f.fixture.push(taskSnapshot("queued", "working", { statusMessage: "progress" }));
	f.fixture.push(finalTask("queued"));
	expect((await next).status).toBe("working");
	expect((await subscription.next(f.lifetime.signal)).status).toBe("completed");
	subscription.close();
});

it("a refused replacement keeps the previously acknowledged observer live", async () => {
	const f = await connect();
	const subscriptions = mcpSubscriptions(f.client);
	const a = subscriptions.watchTask("a", f.lifetime.signal);
	expect(await a.ready).toBe(true);
	f.fixture.rejectTask = "b";
	const b = subscriptions.watchTask("b", f.lifetime.signal);
	await expect(b.ready).rejects.toThrow();
	f.fixture.push(finalTask("a"));
	expect((await a.next(f.lifetime.signal)).status).toBe("completed");
	b.close();
	a.close();
});

it.each(["after-ack", "active"] as const)(
	"a malformed task snapshot %s fails observation and recovers shared subscriptions",
	async (timing) => {
		const f = await connect("http", (fixture) => {
			fixture.capabilities.resources = { listChanged: true, subscribe: true };
			fixture.resources = [{ uri: "test://live", name: "live" }];
			if (timing === "after-ack") {
				const listen = fixture.listen.bind(fixture);
				let sent = false;
				fixture.listen = (request, send, end) => {
					listen(request, send, end);
					if (!sent && [...fixture.streams.values()].some((stream) => stream.ids.includes("broken"))) {
						sent = true;
						fixture.push(taskSnapshot("broken", "invalid-status"));
					}
				};
			}
		});
		const catalogs = vi.fn();
		const resources = vi.fn();
		registerMcpNotificationHandler(f.client, ToolListChangedNotificationSchema, catalogs);
		registerMcpNotificationHandler(f.client, ResourceUpdatedNotificationSchema, resources);
		await f.client.listResources();
		const coordinator = mcpSubscriptions(f.client);
		const watcher = coordinator.watchTask("broken", f.lifetime.signal);
		expect(await watcher.ready).toBe(true);
		const outcome: { error?: unknown; task?: unknown } = {};
		void watcher.next(f.lifetime.signal).then(
			(task) => {
				outcome.task = task;
			},
			(error: unknown) => {
				outcome.error = error;
			},
		);
		if (timing === "active") f.fixture.push(taskSnapshot("broken", "invalid-status"));
		await vi.waitFor(() => expect(outcome.error).toMatchObject({ code: expect.stringMatching(/^MCP_MRTR_/) }), {
			timeout: 500,
		});
		expect(outcome.task).toBeUndefined();
		await vi.waitFor(
			() => {
				const filters = f.fixture.requests.filter((r) => r.method === "subscriptions/listen");
				expect(filters.at(-1)?.params?.notifications).toEqual({
					toolsListChanged: true,
					resourcesListChanged: true,
					resourceSubscriptions: ["test://live"],
				});
				expect(f.fixture.streams.size).toBe(1);
			},
			{ timeout: 2500 },
		);
		f.fixture.notify("notifications/tools/list_changed");
		f.fixture.notify("notifications/resources/updated", { uri: "test://live" });
		await vi.waitFor(() => {
			expect(catalogs).toHaveBeenCalledTimes(1);
			expect(resources).toHaveBeenCalledTimes(1);
		});
		watcher.close();
		const resumed = f.observe("broken");
		await vi.waitFor(() => expect(f.fixture.requests.some((r) => r.method === "tasks/get")).toBe(true));
		f.fixture.push(finalTask("broken"));
		expect(await resumed).toMatchObject({ content: [{ text: "result-broken" }] });
		expect(f.fixture.requests.filter((r) => r.method === "tasks/cancel")).toHaveLength(0);
	},
);

it.each(["abort", "close", "dispose"] as const)(
	"intentional subscription %s stops without scheduling recovery",
	async (stop) => {
		const f = await connect("http", (fixture) => {
			fixture.capabilities.tools = {};
		});
		const signal = new AbortController();
		const coordinator = mcpSubscriptions(f.client);
		const watcher = coordinator.watchTask("stopped", signal.signal);
		expect(await watcher.ready).toBe(true);
		const failed = expect(watcher.next(f.lifetime.signal)).rejects.toMatchObject({
			code: "MCP_MRTR_CONTEXT_CHANGED",
		});
		const retry = vi.spyOn(mcpElapsedClock, "schedule");
		if (stop === "abort") signal.abort();
		else if (stop === "close") watcher.close();
		else coordinator.dispose();
		await failed;
		await vi.waitFor(() => expect(f.fixture.streams.size).toBe(0));
		expect(retry).not.toHaveBeenCalled();
		expect(f.fixture.requests.filter((r) => r.method === "tasks/cancel")).toHaveLength(0);
	},
);

it("an empty honored filter closes intentionally while task snapshots still complete", async () => {
	const f = await connect("http", (fixture) => {
		fixture.capabilities.tools = {};
		fixture.honor = false;
	});
	let gets = 0;
	f.fixture.get = (id) => (++gets === 1 ? taskSnapshot(id) : finalTask(id));
	expect(await f.observe("unhonored")).toMatchObject({ content: [{ text: "result-unhonored" }] });
	await vi.waitFor(() => expect(f.fixture.streams.size).toBe(0));
	expect(gets).toBe(2);
	expect(f.fixture.requests.filter((r) => r.method === "subscriptions/listen")).toHaveLength(1);
});

it.each(["empty", "narrowed"] as const)(
	"a replacement %s ACK ends observation for a previously honored task",
	async (replacement) => {
		const f = await connect("http", (fixture) => {
			fixture.capabilities.tools = {};
		});
		const coordinator = mcpSubscriptions(f.client);
		const first = coordinator.watchTask("a", f.lifetime.signal);
		expect(await first.ready).toBe(true);
		const outcome: { error?: unknown; task?: unknown } = {};
		void first.next(f.lifetime.signal).then(
			(task) => {
				outcome.task = task;
			},
			(error: unknown) => {
				outcome.error = error;
			},
		);
		f.fixture.honor = replacement === "empty" ? false : ["b"];
		const second = coordinator.watchTask("b", f.lifetime.signal);
		expect(await second.ready).toBe(replacement === "narrowed");
		await vi.waitFor(() => expect(outcome.error).toMatchObject({ code: "MCP_MRTR_TRANSPORT_FAILED" }), {
			timeout: 500,
		});
		expect(outcome.task).toBeUndefined();
		first.close();
		let gets = 0;
		f.fixture.get = (id) => (++gets === 1 ? taskSnapshot(id) : finalTask(id));
		expect(await f.observe("a")).toMatchObject({ content: [{ text: "result-a" }] });
		expect(gets).toBe(2);
		if (replacement === "narrowed") {
			f.fixture.push(finalTask("b"));
			expect(await second.next(f.lifetime.signal)).toMatchObject({ taskId: "b", status: "completed" });
		} else await vi.waitFor(() => expect(f.fixture.streams.size).toBe(0));
		second.close();
		expect(f.fixture.requests.filter((r) => r.method === "tasks/cancel")).toHaveLength(0);
	},
);

it.each([
	["progress", "authority"],
	["terminal", "authority"],
	["progress", "generation"],
	["terminal", "generation"],
] as const)("revalidates %s notification against current %s without polling", async (update, change) => {
	const f = await connect();
	let revoked = false;
	const progressed = Promise.withResolvers<void>();
	const progress = vi.fn(async () => progressed.resolve());
	const authority = vi.fn(async () => {
		if (revoked && change === "generation") throw new McpMrtrError("MCP_MRTR_CONTEXT_CHANGED");
		return revoked ? "revoked" : "current";
	});
	const result = f.client.request(
		{ method: "tasks/get", params: { taskId: "authorized" } },
		ResultSchema,
		mcpRequestOptions(
			createMcpRequestOrigin({
				connection: f.connection,
				binding: {},
				signal: f.lifetime.signal,
				observingTaskId: "authorized",
				serverLabel: "fixture",
				isCurrent: () => true,
				resolveAuthority: authority,
				taskProgress: progress,
			}),
			{ signal: f.lifetime.signal, timeout: 1000 },
		),
	);
	const outcome: { error?: unknown; result?: unknown } = {};
	void result.then(
		(value) => {
			outcome.result = value;
		},
		(error: unknown) => {
			outcome.error = error;
		},
	);
	await progressed.promise;
	revoked = true;
	f.fixture.push(
		update === "terminal"
			? finalTask("authorized")
			: taskSnapshot("authorized", "working", { statusMessage: "revoked-progress" }),
	);
	await vi.waitFor(() => expect(outcome.error).toMatchObject({ code: "MCP_MRTR_CONTEXT_CHANGED" }), { timeout: 500 });
	expect(outcome.result).toBeUndefined();
	expect(progress).toHaveBeenCalledTimes(1);
	expect(authority.mock.calls.length).toBeGreaterThan(1);
	expect(f.fixture.requests.filter((r) => r.method === "tasks/get")).toHaveLength(1);
	expect(f.fixture.requests.filter((r) => r.method === "tasks/cancel")).toHaveLength(0);
});
