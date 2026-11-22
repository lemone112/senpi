#!/usr/bin/env node

// A legacy peer that spends its process life when probed before initialize.
import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";

const [logFile, excludedKey, mode = "legacy", settingsJson = "{}"] = process.argv.slice(2);
const settings = JSON.parse(settingsJson);
appendFileSync(logFile, `${JSON.stringify({
	kind: "spawn",
	value: process.env.SENPI_STDIO_RESOLVED,
	excluded: process.env[excludedKey] ?? null,
	pid: process.pid,
})}\n`);

if (mode === "legacy-tree") {
	const child = spawn(process.execPath, ["-e", "process.stdout.write('ready'); setInterval(() => {}, 60000)"], {
		stdio: ["ignore", "pipe", "ignore"],
	});
	await new Promise((resolve, reject) => {
		child.once("error", reject);
		child.stdout.once("data", resolve);
	});
	appendFileSync(logFile, `${JSON.stringify({ kind: "descendant", parent: process.pid, pid: child.pid })}\n`);
}

if (settings.startupDelayMs) await delay(settings.startupDelayMs);

createInterface({ input: process.stdin }).on("line", async (line) => {
	const message = JSON.parse(line);
	appendFileSync(logFile, `${JSON.stringify({ kind: "wire", pid: process.pid, at: Date.now(), message })}\n`);
	if (message.id === undefined) return;
	if (message.method === "server/discover") {
		if (settings.discoveryMarker) process.stderr.write("fixture received discovery\n");
		if (settings.discoverDelayMs) await delay(settings.discoverDelayMs);
		if (settings.discover === "silent") return;
		if (settings.discover === "reject") {
			process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "discovery not supported" } })}\n`);
			return;
		}
		if (mode === "legacy") process.exit(0);
		if (mode === "legacy-tree") {
			process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } })}\n`);
			return;
		}
		process.stdout.write(`${JSON.stringify({
			jsonrpc: "2.0", id: message.id,
			result: { resultType: "complete", supportedVersions: ["2026-07-28"], capabilities: { tools: {} },
				_meta: { "io.modelcontextprotocol/serverInfo": { name: "modern", version: "1" } } },
		})}\n`);
	}
	if (message.method === "tools/list") {
		process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id,
			result: { resultType: "complete", tools: [], ttlMs: 0, cacheScope: "private" } })}\n`);
	}
	if (message.method === "initialize") {
		if (settings.initializeDelayMs) await delay(settings.initializeDelayMs);
		if (settings.initializeErrorCode !== undefined) {
			process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: settings.initializeErrorCode, message: "initialize rejected" } })}\n`);
			return;
		}
		process.stdout.write(`${JSON.stringify({
			jsonrpc: "2.0", id: message.id,
			result: { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "legacy", version: "1" } },
		})}\n`);
	}
});
