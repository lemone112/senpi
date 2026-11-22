#!/usr/bin/env node

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "../packages/coding-agent/src/vendor/mcp/client/index.mjs";

// Actual HTTP transport and local wire: connect owns cancellation from before
// discovery through adoption, independent of the shorter per-probe policy.
async function fixture(t, onDiscover) {
	const messages = [];
	const timers = new Set();
	const server = createServer(async (request, response) => {
		let body = "";
		for await (const chunk of request) body += chunk;
		const message = JSON.parse(body);
		messages.push(message);
		const reply = () => {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: {
				resultType: "complete", supportedVersions: ["2026-07-28"], capabilities: { tools: {} },
				_meta: { "io.modelcontextprotocol/serverInfo": { name: "delayed-discovery", version: "1" } },
			} }));
		};
		const delayReply = (ms) => { const timer = setTimeout(reply, ms); timers.add(timer); };
		onDiscover(message, reply, delayReply);
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(async () => {
		for (const timer of timers) clearTimeout(timer);
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});
	const client = new Client({ name: "initial-negotiation", version: "1" }, {
		versionNegotiation: { mode: "auto", probe: { timeoutMs: 1000 } },
	});
	t.after(() => client.close());
	const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`));
	return { client, transport, messages };
}

test("initial HTTP negotiation does not send after an already aborted signal", async (t) => {
	const f = await fixture(t, (_message, reply) => reply());
	await assert.rejects(f.client.connect(f.transport, {
		timeout: 1000, signal: AbortSignal.abort(new Error("abort before HTTP discovery")),
	}), /abort before HTTP discovery/);
	assert.equal(f.messages.length, 0);
});

test("initial HTTP discovery rejects cancellation even when the peer sends success", async (t) => {
	const controller = new AbortController();
	const f = await fixture(t, (_message, reply) => {
		controller.abort(new Error("abort HTTP discovery"));
		reply();
	});
	let closed = false;
	f.transport.onclose = () => { closed = true; };
	await assert.rejects(f.client.connect(f.transport, { timeout: 1000, signal: controller.signal }), /abort HTTP discovery/);
	assert.equal(f.messages.length, 1);
	assert.equal(f.client.getNegotiatedProtocolVersion(), undefined);
	assert.equal(closed, true);
});

test("initial HTTP discovery uses the connect deadline instead of a larger probe timeout", async (t) => {
	const f = await fixture(t, (_message, _reply, delayReply) => delayReply(500));
	let closed = false;
	f.transport.onclose = () => { closed = true; };
	await assert.rejects(f.client.connect(f.transport, { timeout: 200 }), /connect deadline/);
	assert.equal(f.messages.length, 1);
	assert.equal(f.client.getNegotiatedProtocolVersion(), undefined);
	assert.equal(closed, true);
});
