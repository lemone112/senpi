import type { McpService } from "./service.ts";

const MAX_INSTRUCTIONS_CHARS = 4000;

export function refreshMcpInstructionsForSession(service: McpService): void {
	service.setMcpInstructions(buildMcpInstructionsBlock(service));
}

export function injectMcpInstructions(service: McpService, systemPrompt: string, pi?: object): string | undefined {
	const pending = pi ? service.getPendingStartupServers(pi) : [];
	const connecting = pending.length
		? `<mcp_connecting>\nMCP servers still connecting: ${pending.map(escapeXml).join(", ")}. Their tool catalogs are not available yet. Use only advertised tools; retry discovery on a later turn after the servers connect.\n</mcp_connecting>`
		: "";
	const instructions = [service.getMcpInstructions(), connecting].filter(Boolean).join("\n\n");
	if (instructions.length === 0) return undefined;
	if (systemPrompt.includes(instructions)) return undefined;
	return `${systemPrompt}\n\n${instructions}`;
}

function buildMcpInstructionsBlock(service: McpService): string {
	const blocks: string[] = [];
	for (const snapshot of service.getServerSnapshots()) {
		const connection = service.getConnection(snapshot.name);
		const instructions =
			connection?.state === "connected"
				? connection.client.getInstructions()
				: service.getCachedInstructions(snapshot.name);
		if (instructions === undefined || instructions.length === 0) continue;
		blocks.push(formatInstructionsBlock(snapshot.name, instructions));
	}
	return blocks.join("\n\n");
}

function formatInstructionsBlock(serverName: string, instructions: string): string {
	const escapedServerName = escapeXml(serverName);
	const cappedInstructions = instructions.slice(0, MAX_INSTRUCTIONS_CHARS);
	const escapedInstructions = escapeXml(cappedInstructions);
	return `<mcp_instructions server="${escapedServerName}">\n${escapedInstructions}\n</mcp_instructions>`;
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
