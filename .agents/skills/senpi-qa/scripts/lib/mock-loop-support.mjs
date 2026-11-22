import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evidenceDir, repoRoot, tsxEntry } from "./common.mjs";
import { RpcClient } from "./rpc-client.mjs";

export const API_PRESETS = {
	"openai-completions": {
		provider: "mock",
		modelId: "mock-model",
		apiKey: "sk-mock-qa-7f3a",
		auth: "bearer",
		path: "/chat/completions",
		baseUrl: (server) => server.url,
	},
	"anthropic-messages": {
		provider: "anthropic",
		modelId: "mock-claude",
		apiKey: "sk-ant-mock-7f3a",
		auth: "x-api-key",
		path: "/messages",
		baseUrl: (server) => server.origin,
	},
	"openai-responses": {
		provider: "openai",
		modelId: "mock-gpt",
		apiKey: "sk-openai-mock-7f3a",
		auth: "bearer",
		path: "/responses",
		baseUrl: (server) => server.url,
	},
};

export const ALL_APIS = Object.keys(API_PRESETS);

export const QA_REASONING_MARKER = "SENPI-QA-REASONING-MARKER-7f3a";
export const QA_FINAL_MARKER = "SENPI-QA-FINAL-MARKER-9d2c";

/** Shared reasoning-first mock turn for loop, RPC, and external TUI QA. */
export function reasoningScriptedTurn({ slow = false } = {}) {
	return {
		reasoning: slow
			? `${QA_REASONING_MARKER} ${"Keep streaming deterministic reasoning for an abort window. ".repeat(36)}`
			: `${QA_REASONING_MARKER} deterministic mock reasoning before the final answer.`,
		text: QA_FINAL_MARKER,
		chunks: slow ? 12 : 3,
		chunkDelayMs: slow ? 500 : 0,
	};
}

export const PROVIDER_ENV_KEYS = [
	"ANTHROPIC_API_KEY", "ANTHROPIC_OAUTH_TOKEN", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY", "DEEPSEEK_API_KEY",
	"NVIDIA_API_KEY", "GEMINI_API_KEY", "GOOGLE_CLOUD_API_KEY", "GROQ_API_KEY", "CEREBRAS_API_KEY", "XAI_API_KEY",
	"FIREWORKS_API_KEY", "TOGETHER_API_KEY", "OPENROUTER_API_KEY", "AI_GATEWAY_API_KEY", "ZAI_API_KEY",
	"ZAI_CODING_CN_API_KEY", "MISTRAL_API_KEY", "MINIMAX_API_KEY", "MINIMAX_CN_API_KEY", "MOONSHOT_API_KEY",
	"MOONSHOTAI_API_KEY", "KIMI_API_KEY", "OPENCODE_API_KEY", "CLOUDFLARE_API_KEY", "HF_TOKEN",
];

export function hermeticEnv(boxEnv) {
	const env = { ...boxEnv };
	for (const key of PROVIDER_ENV_KEYS) delete env[key];
	return env;
}

/**
 * Register the primary preset model plus optional additional local mock models.
 * Additional models share the local server and provider unless explicitly
 * overridden. Supplying retry writes the isolated sandbox settings.json.
 */
export function writeMockModelsJson(agentDir, server, apiName, modelOverrides = {}, { models = [], retry } = {}) {
	const preset = API_PRESETS[apiName];
	const baseUrl = preset.baseUrl(server);
	if (!Array.isArray(models)) {
		throw new Error("mock models must be an array of additional model definitions");
	}
	const modelDefaults = {
		baseUrl,
		api: apiName,
		contextWindow: 128000,
		maxTokens: 4096,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	};
	const additionalModels = models.map((model, index) => {
		if (!model || typeof model !== "object" || Array.isArray(model) || typeof model.id !== "string" || !model.id) {
			throw new Error(`mock models[${index}] must define a non-empty id`);
		}
		return { ...modelDefaults, ...model };
	});
	const configuredModels = [{ id: preset.modelId, ...modelDefaults, ...modelOverrides }, ...additionalModels];
	const modelIds = new Set();
	for (const model of configuredModels) {
		if (modelIds.has(model.id)) throw new Error(`mock models must not repeat id ${model.id}`);
		modelIds.add(model.id);
	}
	const config = {
		providers: {
			[preset.provider]: {
				baseUrl,
				apiKey: preset.apiKey,
				api: apiName,
				models: configuredModels,
			},
		},
	};
	writeFileSync(join(agentDir, "models.json"), JSON.stringify(config, null, 2));
	if (retry !== undefined) {
		if (!retry || typeof retry !== "object" || Array.isArray(retry)) {
			throw new Error("mock retry settings must be an object");
		}
		writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ retry }, null, 2));
	}
}

export function assertMcpFixtureToolName(toolName) {
	if (!/^mcp_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+$/.test(toolName)) {
		throw new Error(`--with-mcp-tool requires an mcp_<server>_<tool> name, got: ${toolName}`);
	}
	if (!/^mcp_fx_tool_\d+$/.test(toolName)) {
		throw new Error(`mock-loop MCP fixture can register mcp_fx_tool_<n> tools only, got: ${toolName}`);
	}
}

export function mcpFixtureForToolName(toolName) {
	const match = /^mcp_fx_tool_(\d+)$/.exec(toolName);
	const toolIndex = Number(match?.[1] ?? "1");
	return {
		sourceToolName: `tool_${toolIndex}`,
		toolCount: toolIndex,
		resultPrefix: `fixture tool_${toolIndex}`,
	};
}

export function writeMcpFixtureExtension(box, { toolName, fixture }) {
	const root = repoRoot();
	const callLogPath = join(box.dir, "mcp-fixture-calls.jsonl");
	const extensionPath = join(box.dir, "mcp-fixture-extension.mjs");
	writeFileSync(join(box.agentDir, "mcp.json"), JSON.stringify({ mcpServers: { fx: {
		type: "stdio",
		lifecycle: "eager",
		command: process.execPath,
		args: [tsxEntry(root), "--tsconfig", join(root, "tsconfig.json"),
			join(root, "packages/coding-agent/test/mcp/fixtures/stdio-server.ts"), "--tools", String(fixture.toolCount)],
		connectTimeoutMs: 5000,
		startupTimeoutMs: 5000,
	} } }));
	const source = `
import { appendFileSync } from "node:fs";

const toolName = ${JSON.stringify(toolName)};
const sourceToolName = ${JSON.stringify(fixture.sourceToolName)};
const callLogPath = ${JSON.stringify(callLogPath)};

export default function(pi) {
	pi.on("tool_result", (event) => {
		if (event.toolName !== toolName) return;
		appendFileSync(callLogPath, JSON.stringify({
			toolCallId: event.toolCallId, toolName, sourceToolName, params: event.input,
			result: { content: event.content, isError: event.isError },
			path: "builtin MCP -> native SDK -> registered MCP tool",
		}) + "\\n");
	});
}
`;
	writeFileSync(extensionPath, source);
	return {
		enableBuiltinExtensions: true,
		mcpToolCount: fixture.toolCount,
		diagnosticPaths: Object.fromEntries(["fx", "service", "startup"].map((name) => [
			`mcp-${name}.log`, join(box.agentDir, "logs", "mcp", `${name}.log`),
		])),
		extraArgs: ["--extension", extensionPath],
		callLogPath,
		expectedResultText: fixture.resultPrefix,
		extensionPath,
	};
}

/** Drive the ordinary builtin with an immediate first prompt; the CLI owns bounded startup readiness. */
export async function runMcpFixtureTurn({ box, args, prompt, timeoutMs, toolCount }) {
	const client = new RpcClient({ env: hermeticEnv(box.env), cwd: box.cwd, extraArgs: args });
	const closed = new Promise((resolve) => client.child.once("close", (code) => resolve(code)));
	const deadline = Date.now() + timeoutMs;
	const remaining = () => Math.max(1, deadline - Date.now());
	let inventory;
	let failure;
	const watchdog = setTimeout(() => client.child.kill("SIGKILL"), timeoutMs);
	try {
		const completed = client.waitForEvent((event) => event.type === "agent_end", { timeoutMs: remaining() });
		void completed.catch(() => {});
		const response = await client.send({ type: "prompt", message: prompt }, { timeoutMs: remaining() });
		if (!response.success) throw new Error("RPC rejected the fixture prompt");
		await completed;
		const loaded = await client.send({ type: "get_loaded_surfaces" }, { timeoutMs: remaining() });
		if (!loaded.success) throw new Error("RPC could not read loaded surfaces");
		inventory = loaded.data;
		if (!inventory.mcpServers.some((server) => server.name === "fx" && server.status === "connected" && server.toolCount === toolCount)) {
			throw new Error("First prompt finished without the fixture catalog");
		}
	} catch (error) {
		failure = error instanceof Error ? error.message : String(error);
	} finally {
		client.close();
	}
	const exitCode = await closed;
	clearTimeout(watchdog);
	return {
		code: failure ? 1 : exitCode,
		stdout: client.events.map((event) => JSON.stringify(event)).join("\n"),
		stderr: `${client.stderr}${failure ? `\n${failure}` : ""}`,
		mcpStartup: inventory,
	};
}

export function validateMcpFixtureToolResult({ prepared, server }) {
	const calls = readFixtureCalls(prepared.callLogPath);
	const fixtureCall = calls.find((call) => call.toolName && call.sourceToolName && !call.result?.isError &&
		call.result?.content?.some((part) => part.type === "text" && part.text.includes(prepared.expectedResultText)));
	const requestSawResult = server.requests
		.slice(1)
		.some((request) => JSON.stringify(request.messages ?? "").includes(prepared.expectedResultText));
	const firstAdvertised = server.requests[0]?.tools?.some((tool) =>
		(tool.function?.name ?? tool.name) === fixtureCall?.toolName) === true;
	return {
		name: "first model request advertised the MCP tool, executed it, and received its result",
		pass: !!fixtureCall && firstAdvertised && requestSawResult,
		detail: `firstAdvertised=${firstAdvertised} callLog=${fixtureCall ? "yes" : "no"} modelSawFixtureResult=${requestSawResult}`,
	};
}

function readFixtureCalls(path) {
	if (!path || !existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line, index) => {
			try {
				return JSON.parse(line);
			} catch (error) {
				return { parseError: safeErrorReason(error), line: index + 1 };
			}
		});
}

export function checkRealAuthUnchanged(checks, guard) {
	try {
		checks.ok("real auth unchanged", guard.assertUnchanged(), guard.path);
	} catch (error) {
		checks.ok("real auth unchanged", false, `credential guard failed at ${guard.path}: ${safeErrorReason(error)}`);
	}
}

export function safeErrorReason(error) {
	return error instanceof Error ? error.name : typeof error;
}

export function writeToolEvidence(slug, { apiName, result, server, prepared }) {
	const dir = evidenceDir(slug);
	if (result.mcpStartup) writeFileSync(join(dir, "mcp-startup-inventory.json"), JSON.stringify(result.mcpStartup, null, 2));
	for (const [name, path] of Object.entries(prepared.diagnosticPaths ?? {})) {
		if (existsSync(path)) writeFileSync(join(dir, name), readFileSync(path, "utf8"));
	}
	writeFileSync(join(dir, `mock-loop-${apiName}-stdout.txt`), result.stdout);
	writeFileSync(join(dir, `mock-loop-${apiName}-stderr.txt`), result.stderr);
	writeFileSync(join(dir, `mock-loop-${apiName}-requests.json`), JSON.stringify(sanitizeRequests(server.requests), null, 2));
	if (prepared.callLogPath && existsSync(prepared.callLogPath)) {
		writeFileSync(join(dir, "mcp-fixture-calls.jsonl"), readFileSync(prepared.callLogPath, "utf8"));
	}
	writeFileSync(
		join(dir, "summary.json"),
		JSON.stringify(
			{
				command: `node .agents/skills/senpi-qa/scripts/mock-loop.mjs ${process.argv.slice(2).join(" ")}`,
				apiName,
				requests: server.requests.length,
				fixtureCallLog: prepared.callLogPath ? "mcp-fixture-calls.jsonl" : null,
			},
			null,
			2,
		),
	);
	process.stderr.write(`evidence: ${dir}\n`);
}

function sanitizeRequests(requests) {
	return requests.map((request) => ({
		...request,
		authorization: request.authorization ? "<mock-redacted>" : null,
		apiKeyHeader: request.apiKeyHeader ? "<mock-redacted>" : null,
	}));
}
