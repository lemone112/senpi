#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setImmediate as nextTurn } from "node:timers/promises";
import { Client } from "../packages/coding-agent/src/vendor/mcp/client/index.mjs";
import { StdioClientTransport } from "../packages/coding-agent/src/vendor/mcp/client/stdio.mjs";
import { isProcessAlive, reapProcessTree } from "../packages/coding-agent/src/core/extensions/builtin/mcp/process-tree.ts";

function fixture(t) {
	const directory = mkdtempSync(join(tmpdir(), "senpi-stdio-resolver-"));
	t.after(() => {
		for (const { pid } of events().filter((event) => event.kind === "descendant")) {
			try { process.kill(pid, "SIGKILL"); } catch { /* already reaped */ }
		}
		rmSync(directory, { recursive: true, force: true });
	});
	const logFile = join(directory, "starts.jsonl");
	// libuv itself supplies USERPROFILE/PATH on Windows even with an explicit
	// empty environment. APPDATA is inherited by the SDK, but not by libuv.
	const excludedKey = process.platform === "win32" ? "APPDATA" : "HOME";
	const parameters = (value, mode = "legacy", settings = {}) => ({
		command: process.execPath,
		args: [fileURLToPath(new URL("./mcp-stdio.test-support.mjs", import.meta.url)), logFile, excludedKey, mode, JSON.stringify(settings)],
		env: { SENPI_STDIO_RESOLVED: value },
		inheritEnvironment: false,
		stderr: "pipe",
	});
	// A filesystem event may precede completion of the final append.
	const events = () => existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").slice(0, -1).filter(Boolean).map((line) => JSON.parse(line)) : [];
	const starts = () => events().filter((event) => event.kind === "spawn");
	const messages = () => events().filter((event) => event.kind === "wire").map((event) => event.message);
	const descendants = () => events().filter((event) => event.kind === "descendant");
	return { parameters, starts, messages, descendants, excludedKey, directory };
}

test("initial stdio negotiation with an aborted signal never starts a child", async (t) => {
	const f = fixture(t);
	const client = new Client({ name: "aborted-start", version: "1" }, { versionNegotiation: { mode: "auto" } });
	t.after(() => client.close());
	await assert.rejects(client.connect(new StdioClientTransport(f.parameters("modern", "modern")), {
		timeout: 1000, signal: AbortSignal.abort(new Error("aborted before initial probe")),
	}), /aborted before initial probe/);
	assert.equal(f.starts().length, 0);
});

test("initial stdio discovery cancellation disposes the probe without starting a session", { timeout: 5000 }, async (t) => {
	const f = fixture(t);
	const controller = new AbortController();
	const watcher = watch(f.directory, () => {
		if (f.messages().some((message) => message.method === "server/discover")) controller.abort(new Error("abort initial discovery"));
	});
	t.after(() => watcher.close());
	const client = new Client({ name: "aborted-discovery", version: "1" }, { versionNegotiation: { mode: "auto" } });
	t.after(() => client.close());
	await assert.rejects(client.connect(new StdioClientTransport(f.parameters("modern", "modern", { discoverDelayMs: 200 })), {
		timeout: 1000, signal: controller.signal,
	}), /abort initial discovery/);
	assert.equal(f.starts().length, 1);
	for (const { pid } of f.starts()) assert.equal(isProcessAlive(pid), false);
});

test("cancellation during disposable cleanup cannot accept modern discovery or attach a session", async (t) => {
	const f = fixture(t);
	const controller = new AbortController();
	const client = new Client({ name: "cancel-before-attach", version: "1" }, { versionNegotiation: { mode: "auto" } });
	t.after(() => client.close());
	const transport = new StdioClientTransport({
		...f.parameters("modern", "modern"),
		beforeClose: async (pid) => {
			controller.abort(new Error("abort before session attach"));
			await reapProcessTree(pid, { termWaitMs: 400, killWaitMs: 500 });
		},
	});
	await assert.rejects(client.connect(transport, { timeout: 2000, signal: controller.signal }), /abort before session attach/);
	assert.equal(f.starts().length, 1);
	assert.equal(client.getNegotiatedProtocolVersion(), undefined);
	assert.equal(transport.pid, null);
});

test("cancellation while resolving the initial descriptor cannot launch a late child", { timeout: 5000 }, async (t) => {
	const f = fixture(t);
	const entered = Promise.withResolvers();
	const resolved = Promise.withResolvers();
	const controller = new AbortController();
	const transport = new StdioClientTransport({
		...f.parameters("stale"),
		resolveParameters: () => { entered.resolve(); return resolved.promise; },
	});
	const client = new Client({ name: "pending-descriptor", version: "1" }, { versionNegotiation: { mode: "auto" } });
	t.after(() => { resolved.resolve(f.parameters("late", "modern")); return client.close(); });
	const rejected = assert.rejects(client.connect(transport, { timeout: 1000, signal: controller.signal }), /cancel descriptor/);
	await entered.promise;
	controller.abort(new Error("cancel descriptor"));
	await rejected;
	resolved.resolve(f.parameters("late", "modern"));
	await nextTurn();
	assert.equal(f.starts().length, 0);
	assert.equal(transport.pid, null);
});

test("initial stdio connect deadline also bounds the remaining legacy initialize", { timeout: 5000 }, async (t) => {
	const f = fixture(t);
	const transport = new StdioClientTransport(f.parameters("legacy", "modern", { discover: "silent", initializeDelayMs: 600 }));
	const client = new Client({ name: "whole-connect-budget", version: "1" }, {
		versionNegotiation: { mode: "auto", probe: { timeoutMs: 200 } },
	});
	const closed = new Promise((resolve) => { transport.onclose = resolve; });
	t.after(() => client.close());
	await assert.rejects(client.connect(transport, { timeout: 700 }));
	await closed;
	assert.equal(f.messages().filter((message) => message.method === "initialize").length, 1);
	assert.equal(client.getNegotiatedProtocolVersion(), undefined);
	for (const { pid } of f.starts()) assert.equal(isProcessAlive(pid), false);
});

// The SDK's disposable process is invisible to the host's session PID tracker.
// Check OS liveness before the runner exits, when runner cleanup cannot mask an
// orphan; use the same tree reaper the production host supplies to this seam.
test("stdio disposes probe and session process trees through the host lifecycle exactly once", { timeout: 10_000 }, async (t) => {
	const f = fixture(t);
	const reaped = [];
	const transport = new StdioClientTransport({
		...f.parameters("stale", "legacy-tree"),
		resolveParameters: async () => f.parameters("current", "legacy-tree"),
		beforeClose: async (pid) => {
			assert.ok(isProcessAlive(pid), "the root must still be alive when its tree is collected");
			reaped.push(pid);
			await reapProcessTree(pid, { termWaitMs: 400, killWaitMs: 500 });
		},
	});
	const client = new Client({ name: "tree-test", version: "1" }, { versionNegotiation: { mode: "auto" } });
	t.after(() => client.close());
	await client.connect(transport, { timeout: 2000 });
	const [probe, session] = f.starts();
	const descendants = f.descendants();
	assert.equal(descendants.length, 2);
	assert.equal(isProcessAlive(probe.pid), false);
	assert.equal(isProcessAlive(descendants.find((child) => child.parent === probe.pid).pid), false);
	assert.deepEqual(reaped, [probe.pid]);
	assert.equal(isProcessAlive(session.pid), true);
	await Promise.all([client.close(), transport.close()]);
	assert.deepEqual(reaped, [probe.pid, session.pid]);
	for (const { pid } of [...f.starts(), ...descendants]) assert.equal(isProcessAlive(pid), false, `process ${pid} survived teardown`);
});

// A cold child can outlive the short discovery window without being legacy.
// Real pipes and the public connect deadline distinguish that case from a
// silent legacy peer; existing immediate-response fixtures cannot catch it.
for (const code of [-32601, -32020]) {
	test(`cold stdio modern initialization rejection ${code} recovers within the connect budget`, { timeout: 8000 }, async (t) => {
		const f = fixture(t);
		const transport = new StdioClientTransport(f.parameters("cold", "modern", {
			startupDelayMs: 900, initializeErrorCode: code,
		}));
		const client = new Client({ name: "cold-modern", version: "1" }, {
			versionNegotiation: { mode: "auto", probe: { timeoutMs: 750 } },
		});
		t.after(() => client.close());
		await client.connect(transport, { timeout: 3000, signal: AbortSignal.timeout(3000) });
		assert.equal(client.getProtocolEra(), "modern");
		assert.deepEqual((await client.listTools()).tools, []);
		assert.equal(f.starts().length, 2, "recovery must reuse the already running session child");
		const requests = f.messages().filter((message) => message.id !== undefined);
		assert.deepEqual(requests.map((message) => message.method), ["initialize", "server/discover", "tools/list"]);
		assert.equal(requests[0].id, 0, "initialize retains the native numeric id, including zero");
		assert.equal(requests[2].params._meta["io.modelcontextprotocol/protocolVersion"], "2026-07-28");
	});
}

for (const [name, settings] of [
	["silent legacy", { discover: "silent", initializeDelayMs: 1000 }],
	["cold dual-era", { startupDelayMs: 900 }],
]) {
	test(`${name} keeps its initialize budget and remains legacy after a successful handshake`, { timeout: 8000 }, async (t) => {
		const f = fixture(t);
		const client = new Client({ name: "legacy-budget", version: "1" }, {
			versionNegotiation: { mode: "auto", probe: { timeoutMs: 750 } },
		});
		t.after(() => client.close());
		await client.connect(new StdioClientTransport(f.parameters("legacy", "modern", settings)), {
			timeout: 3000, signal: AbortSignal.timeout(3000),
		});
		assert.equal(client.getProtocolEra(), "legacy");
		assert.deepEqual((await client.listTools()).tools, []);
		const messages = f.messages();
		const initialization = messages.find((message) => message.method === "initialize");
		assert.equal(initialization.id, 0);
		assert.equal(initialization.params._meta, undefined);
		assert.deepEqual(messages.slice(messages.indexOf(initialization)).map((message) => message.method), [
			"initialize", "notifications/initialized", "tools/list",
		]);
	});
}

for (const [name, settings, expectedDiscoveries] of [
	["an unrelated initialize error", { initializeErrorCode: -32603 }, 0],
	["a definitive legacy verdict", { startupDelayMs: 0, initializeErrorCode: -32601, discover: "reject" }, 1],
	["a rejected recovery discovery", { initializeErrorCode: -32601, discover: "reject" }, 1],
	["a silent recovery discovery", { initializeErrorCode: -32020, discover: "silent" }, 1],
]) {
	test(`${name} rejects without retry loops and closes its child`, { timeout: 8000 }, async (t) => {
		const f = fixture(t);
		const transport = new StdioClientTransport(f.parameters("failure", "modern", { startupDelayMs: 900, ...settings }));
		const client = new Client({ name: "failed-recovery", version: "1" }, {
			versionNegotiation: { mode: "auto", probe: { timeoutMs: 750 } },
		});
		const closed = new Promise((resolve) => { transport.onclose = resolve; });
		t.after(() => client.close());
		await assert.rejects(client.connect(transport, { timeout: 3000, signal: AbortSignal.timeout(3000) }));
		await closed;
		assert.equal(f.starts().length, 2);
		const messages = f.messages();
		assert.equal(messages.filter((message) => message.method === "initialize").length, 1);
		assert.equal(messages.filter((message) => message.method === "server/discover").length, expectedDiscoveries);
		for (const { pid } of f.starts()) assert.equal(isProcessAlive(pid), false, `process ${pid} survived failed connect`);
	});
}

for (const cancel of [false, true]) {
	test(`recovery discovery preserves the original ${cancel ? "cancellation" : "connect deadline"} and closes its child`, { timeout: 8000 }, async (t) => {
		const f = fixture(t);
		const transport = new StdioClientTransport(f.parameters("bounded", "modern", {
			startupDelayMs: 900, initializeErrorCode: -32601, discover: "silent", discoveryMarker: true,
		}));
		const client = new Client({ name: "bounded-recovery", version: "1" }, {
			versionNegotiation: { mode: "auto", probe: { timeoutMs: 750 } },
		});
		const controller = new AbortController();
		if (cancel) transport.stderr.on("data", () => controller.abort(new Error("cancel recovery")));
		const closed = new Promise((resolve) => { transport.onclose = resolve; });
		t.after(() => client.close());
		await assert.rejects(client.connect(transport, {
			timeout: cancel ? 3000 : 2100, signal: controller.signal,
		}), cancel ? /cancel recovery/ : /connect deadline/);
		await closed;
		assert.equal(f.messages().filter((message) => message.method === "server/discover").length, 1);
		assert.equal(f.starts().length, 2);
		for (const { pid } of f.starts()) assert.equal(isProcessAlive(pid), false, `process ${pid} survived abandoned recovery`);
	});
}

test("a failed host cleanup still completes ordinary stdio teardown", { timeout: 10_000 }, async (t) => {
	const f = fixture(t);
	let callbacks = 0;
	const transport = new StdioClientTransport({
		...f.parameters("legacy"),
		beforeClose: async () => {
			callbacks++;
			throw new Error("host cleanup failed");
		},
	});
	const client = new Client({ name: "cleanup-error-test", version: "1" });
	t.after(() => client.close());
	await client.connect(transport, { timeout: 2000 });
	const pid = transport.pid;
	await client.close();
	assert.equal(callbacks, 1);
	assert.equal(isProcessAlive(pid), false);
});

test("native stdio discovery and legacy session each resolve fresh authorized parameters", { timeout: 10_000 }, async (t) => {
	const f = fixture(t);
	const previous = process.env[f.excludedKey];
	process.env[f.excludedKey] = "UNAPPROVED_PARENT_ENV";
	t.after(() => {
		if (previous === undefined) delete process.env[f.excludedKey];
		else process.env[f.excludedKey] = previous;
	});
	let resolutions = 0;
	const transport = new StdioClientTransport({
		...f.parameters("STALE_DESCRIPTOR"),
		resolveParameters: async () => f.parameters(String(++resolutions)),
	});
	const client = new Client({ name: "resolver-test", version: "1" }, { versionNegotiation: { mode: "auto" } });
	t.after(() => client.close());
	await client.connect(transport, { timeout: 2000 });
	await client.close();
	assert.equal(resolutions, 2);
	assert.deepEqual(f.starts().map(({ value, excluded }) => ({ value, excluded })), [
		{ value: "1", excluded: null },
		{ value: "2", excluded: null },
	]);
});

test("revocation after the disposable discovery process prevents the session spawn", { timeout: 10_000 }, async (t) => {
	const f = fixture(t);
	let resolutions = 0;
	const transport = new StdioClientTransport({
		...f.parameters("STALE_DESCRIPTOR"),
		resolveParameters: async () => {
			if (++resolutions === 2) throw new Error("launch authorization revoked");
			return f.parameters("probe");
		},
	});
	const client = new Client({ name: "resolver-test", version: "1" }, { versionNegotiation: { mode: "auto" } });
	t.after(() => client.close());
	await assert.rejects(client.connect(transport, { timeout: 2000 }), /launch authorization revoked/);
	assert.equal(resolutions, 2);
	assert.equal(f.starts().length, 1);
	assert.equal(transport.pid, null);
});

test("closing while parameter resolution is pending cannot launch a late process", { timeout: 10_000 }, async (t) => {
	const f = fixture(t);
	const resolved = Promise.withResolvers();
	const transport = new StdioClientTransport({
		...f.parameters("STALE_DESCRIPTOR"),
		resolveParameters: () => resolved.promise,
	});
	t.after(() => transport.close());
	const starting = transport.start();
	const rejected = assert.rejects(starting, /Transport closed while resolving process parameters/);
	await transport.close();
	resolved.resolve(f.parameters("too-late"));
	await rejected;
	assert.equal(f.starts().length, 0);
	assert.equal(transport.pid, null);
});

test("modern discovery and subsequent envelopes use the explicit capability projection", { timeout: 10_000 }, async (t) => {
	const f = fixture(t);
	const client = new Client({ name: "capabilities-test", version: "1" }, {
		capabilities: { elicitation: {} }, modernCapabilities: {}, versionNegotiation: { mode: "auto" },
	});
	t.after(() => client.close());
	await client.connect(new StdioClientTransport(f.parameters("modern", "modern")), { timeout: 2000 });
	await client.listTools();
	await client.close();
	const messages = f.messages().filter((message) => ["server/discover", "tools/list"].includes(message.method));
	assert.deepEqual(messages.map((message) => message.method), ["server/discover", "tools/list"]);
	for (const message of messages) assert.deepEqual(message.params._meta["io.modelcontextprotocol/clientCapabilities"], {});
});

test("legacy fallback retains initialization capabilities after an empty modern probe", { timeout: 10_000 }, async (t) => {
	const f = fixture(t);
	const client = new Client({ name: "capabilities-test", version: "1" }, {
		capabilities: { elicitation: {} }, modernCapabilities: {}, versionNegotiation: { mode: "auto" },
	});
	t.after(() => client.close());
	await client.connect(new StdioClientTransport(f.parameters("legacy")), { timeout: 2000 });
	await client.close();
	const probe = f.messages().find((message) => message.method === "server/discover");
	const initialization = f.messages().find((message) => message.method === "initialize");
	assert.deepEqual(probe.params._meta["io.modelcontextprotocol/clientCapabilities"], {});
	assert.deepEqual(initialization.params.capabilities, { elicitation: {} });
});

test("omitting a modern projection preserves subsequently registered capabilities", { timeout: 10_000 }, async (t) => {
	const f = fixture(t);
	const client = new Client({ name: "capabilities-test", version: "1" }, {
		capabilities: { elicitation: {} }, versionNegotiation: { mode: "auto" },
	});
	client.registerCapabilities({ roots: { listChanged: true } });
	t.after(() => client.close());
	await client.connect(new StdioClientTransport(f.parameters("modern", "modern")), { timeout: 2000 });
	await client.listTools();
	await client.close();
	const messages = f.messages().filter((message) => ["server/discover", "tools/list"].includes(message.method));
	assert.equal(messages.length, 2);
	for (const message of messages) {
		assert.deepEqual(message.params._meta["io.modelcontextprotocol/clientCapabilities"], { elicitation: {}, roots: { listChanged: true } });
	}
});
