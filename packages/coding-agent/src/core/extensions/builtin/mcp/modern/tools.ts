import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { z } from "zod";
import { loadMcpSdkTypes } from "../sdk.lazy.ts";
import type { McpJsonSchema } from "../tool-contracts.ts";
import { McpMrtrError } from "./errors.ts";
import { physicalMcpClient, takeMcpRequestOrigin } from "../request-origin.ts";
import { parseMcpTask } from "./tasks.ts";
import { compileModernSchema, hasSupportedModernToolSchemas, McpToolSchemaError } from "./tool-schema.ts";

const jsonSchema = z.union([z.boolean(), z.record(z.string(), z.json())]);
const modernToolSchema = z.looseObject({
	name: z.string(),
	inputSchema: jsonSchema,
	outputSchema: jsonSchema.optional(),
});
const listResult = z.looseObject({
	tools: z.array(modernToolSchema),
	nextCursor: z.string().optional(),
});
const callResult = z.looseObject({
	isError: z.boolean().optional(),
	structuredContent: z.json().optional(),
});

export async function listModernTools(
	client: Client,
	params?: Parameters<Client["listTools"]>[0],
	options?: RequestOptions,
) {
	// Keep the SDK behind its documented startup boundary, and its Zod identity separate.
	const { ResultSchema, ToolSchema } = await loadMcpSdkTypes();
	const toolMetadata = ToolSchema.omit({ inputSchema: true, outputSchema: true });
	const raw = await client.request({ method: "tools/list", params }, ResultSchema, options);
	const parsed = listResult.safeParse(raw);
	if (!parsed.success) throw new McpMrtrError("MCP_MRTR_INVALID_RESULT");
	const tools = parsed.data.tools.filter(hasSupportedModernToolSchemas).map((tool) => {
		const metadata = toolMetadata.safeParse(tool);
		if (!metadata.success) throw new McpMrtrError("MCP_MRTR_INVALID_RESULT");
		return { ...tool, ...metadata.data };
	});
	return { ...parsed.data, tools };
}

export async function callModernTool(
	client: Client,
	params: Parameters<Client["callTool"]>[0],
	outputSchema: McpJsonSchema | undefined,
	options?: RequestOptions,
) {
	const { CallToolResultSchema, ResultSchema } = await loadMcpSdkTypes();
	const { origin } = takeMcpRequestOrigin(options, physicalMcpClient(client));
	const raw = await client.request({ method: "tools/call", params }, ResultSchema, options);
	if (raw.resultType === "task") {
		const task = parseMcpTask(raw);
		if (!origin?.acceptTask) throw new McpMrtrError("MCP_MRTR_INVALID_RESULT", undefined, task.taskId);
		try {
			await origin.acceptTask(task, params.name, outputSchema);
		} catch {
			throw new McpMrtrError("MCP_TASK_PERSIST_FAILED", undefined, task.taskId);
		}
		return {
			content: [
				{
					type: "text" as const,
					text: `MCP task ${task.taskId} accepted by ${origin.serverLabel}. The session is observing it in the background and will receive the result. Do not submit the operation again.`,
				},
			],
		};
	}
	return validateModernToolResult(raw, outputSchema, CallToolResultSchema);
}

/** Acceptance has its own contract; only the eventual tool output satisfies outputSchema. */
export async function validateModernToolResult(
	raw: Record<string, unknown>,
	outputSchema: McpJsonSchema | undefined,
	contentSchema?: Awaited<ReturnType<typeof loadMcpSdkTypes>>["CallToolResultSchema"],
) {
	const CallToolResultSchema = contentSchema ?? (await loadMcpSdkTypes()).CallToolResultSchema;
	const validate = outputSchema === undefined ? undefined : compileModernSchema(outputSchema);
	const parsed = callResult.safeParse(raw);
	if (!parsed.success) throw new McpMrtrError("MCP_MRTR_INVALID_RESULT");
	const content = CallToolResultSchema.shape.content.optional().safeParse(raw.content);
	if (!content.success) throw new McpMrtrError("MCP_MRTR_INVALID_RESULT");
	const result = { ...parsed.data, ...(content.data === undefined ? {} : { content: content.data }) };
	if (validate !== undefined && result.isError !== true) {
		if (!Object.hasOwn(result, "structuredContent") || !validate(result.structuredContent)) {
			throw new McpToolSchemaError("MCP_OUTPUT_SCHEMA_MISMATCH", "Tool result does not match outputSchema.");
		}
	}
	return result;
}

/** The task is already completed: invalid final output is a diagnostic, not another observation. */
export async function validateCompletedMcpTaskResult(
	raw: Record<string, unknown>,
	outputSchema: McpJsonSchema | undefined,
	taskId: string,
) {
	try {
		return await validateModernToolResult(raw, outputSchema);
	} catch (error) {
		if (
			!(error instanceof McpToolSchemaError) &&
			!(error instanceof McpMrtrError && error.code === "MCP_MRTR_INVALID_RESULT")
		)
			throw error;
		return {
			isError: true,
			content: [
				{
					type: "text" as const,
					text: `MCP task ${taskId} completed, but its final output is invalid (${error.code}): ${error.message} Inspect the server's saved result before deciding whether to run new work.`,
				},
			],
		};
	}
}
