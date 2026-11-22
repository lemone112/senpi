import { fauxAssistantMessage, getCurrentSystemPrompt, getCurrentTools } from "@earendil-works/pi-ai";
import { afterEach, expect, it } from "vitest";
import { ENV_AGENT_DIR } from "../../src/config.ts";
import mcpExtension from "../../src/core/extensions/builtin/mcp/index.ts";
import { getMcpService, resetMcpServiceForTests } from "../../src/core/extensions/builtin/mcp/service.ts";
import { MCP_STARTUP_TIMEOUT_ENV } from "../../src/core/extensions/builtin/mcp/startup-race.ts";
import type { ExtensionFactory } from "../../src/core/extensions/types.ts";
import { createHarness, type Harness } from "../suite/harness.ts";
import { NativeTasksFixture, startNativeTasks } from "./fixtures/native-tasks.ts";
import { cleanupRoots, makeRoot, setConfig } from "./fixtures/service-lifecycle.ts";

const cleanup: Array<() => Promise<void>> = [];
const harnesses: Harness[] = [];
const agentDir = process.env[ENV_AGENT_DIR];
const startupTimeout = process.env[MCP_STARTUP_TIMEOUT_ENV];
afterEach(async () => {
	for (const harness of harnesses.splice(0)) harness.cleanup();
	await getMcpService().dispose("quit");
	resetMcpServiceForTests();
	if (agentDir === undefined) delete process.env[ENV_AGENT_DIR];
	else process.env[ENV_AGENT_DIR] = agentDir;
	if (startupTimeout === undefined) delete process.env[MCP_STARTUP_TIMEOUT_ENV];
	else process.env[MCP_STARTUP_TIMEOUT_ENV] = startupTimeout;
	await cleanupRoots(cleanup);
});

async function heldCatalog(timeoutMs: number) {
	resetMcpServiceForTests();
	delete process.env[MCP_STARTUP_TIMEOUT_ENV];
	const requested = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	cleanup.push(async () => release.resolve());
	const fixture = new NativeTasksFixture();
	fixture.capabilities.tools = {};
	fixture.beforeReply = async (request) => {
		if (request.method !== "tools/list") return;
		requested.resolve();
		await release.promise;
	};
	const server = await startNativeTasks(fixture);
	cleanup.push(server.close);
	const root = makeRoot("startup-first-turn", cleanup);
	process.env[ENV_AGENT_DIR] = root.agentDir;
	setConfig(root, { fx: { type: "http", url: server.url, auth: false, startupTimeoutMs: timeoutMs } });
	const harness = await createHarness({ extensionFactories: [mcpExtension as ExtensionFactory] });
	harnesses.push(harness);
	await harness.getExtensionRunner().emit({ type: "session_start", reason: "startup" });
	await requested.promise;
	const captured: Array<{ tools: string[]; prompt: string }> = [];
	const capture = () =>
		harness.setResponses([
			(context) => {
				captured.push({
					tools: getCurrentTools(context.messages).map((tool) => tool.name),
					prompt: getCurrentSystemPrompt(context.messages),
				});
				return fauxAssistantMessage("done");
			},
		]);
	capture();
	return { harness, release: release.resolve, captured, capture };
}

it("includes the ready catalog in the first provider request within startupTimeoutMs", async () => {
	const f = await heldCatalog(2000);
	const prompt = f.harness.session.prompt("use the MCP tool");
	const timer = setTimeout(f.release, 80);
	try {
		await prompt;
	} finally {
		clearTimeout(timer);
		f.release();
	}
	expect(f.captured[0]?.tools).toContain("mcp_fx_fixture");
	expect(f.captured[0]?.prompt).not.toContain("<mcp_connecting>");
});

it("bounds the first wait, describes connecting, and publishes the later catalog", async () => {
	const f = await heldCatalog(80);
	const started = performance.now();
	await f.harness.session.prompt("use the MCP tool");
	const elapsed = performance.now() - started;
	expect(elapsed).toBeGreaterThanOrEqual(60);
	expect(elapsed).toBeLessThan(800);
	expect(f.captured[0]?.tools).not.toContain("mcp_fx_fixture");
	expect(f.captured[0]?.prompt).toContain("MCP servers still connecting: fx");
	f.release();
	await getMcpService().whenAttachSettled();
	f.capture();
	await f.harness.session.prompt("try the tool again");
	expect(f.captured[1]?.tools).toContain("mcp_fx_fixture");
	expect(f.captured[1]?.prompt).not.toContain("<mcp_connecting>");
});

it("cancels the first wait without publishing a provider request or stopping background discovery", async () => {
	const f = await heldCatalog(5000);
	const started = performance.now();
	const prompt = f.harness.session.prompt("use the MCP tool");
	const timer = setTimeout(() => {
		void f.harness.session.abort();
	}, 40);
	try {
		await expect(prompt).rejects.toMatchObject({ name: "AbortError" });
	} finally {
		clearTimeout(timer);
		f.release();
	}
	expect(performance.now() - started).toBeLessThan(800);
	expect(f.captured).toHaveLength(0);
	await getMcpService().whenAttachSettled();
	f.capture();
	await f.harness.session.prompt("try after cancellation");
	expect(f.captured[0]?.tools).toContain("mcp_fx_fixture");
});
