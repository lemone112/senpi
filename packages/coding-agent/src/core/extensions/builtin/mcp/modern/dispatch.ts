import type { MaterializeMcpTransportOptions, McpMaterializedTransport } from "../transport-sdk.ts";
import { materializeMcpTransport } from "../transport-sdk.ts";
import type { ModernProtocolState } from "./request.ts";
import { mcpSubscriptions } from "./sdk-subscriptions.ts";
import { loadMcpSdkClient } from "../sdk.lazy.ts";
import { ConnectError } from "../errors.ts";

/** The SDK owns discovery, version negotiation and both wire eras. */
export async function materializeNegotiatedTransport(
	options: MaterializeMcpTransportOptions,
	serverName: string,
	timeoutMs: number,
	signal: AbortSignal,
): Promise<McpMaterializedTransport> {
	signal.throwIfAborted();
	const protocol: ModernProtocolState = {};
	const materialized = await materializeMcpTransport(options, protocol);
	const { client, transport } = materialized;
	client.setVersionNegotiation({
		mode: "auto",
		probe: { timeoutMs: options.spec.kind === "http" ? timeoutMs : Math.min(2000, Math.floor(timeoutMs / 4)) },
	});
	const connect = client.connect.bind(client);
	client.connect = async (current, connectOptions) => {
		try {
			signal.throwIfAborted();
			connectOptions?.signal?.throwIfAborted();
			await connect(current, connectOptions);
			signal.throwIfAborted();
			connectOptions?.signal?.throwIfAborted();
		} catch (error) {
			const { UnsupportedProtocolVersionError } = await loadMcpSdkClient();
			if (error instanceof UnsupportedProtocolVersionError)
				throw new ConnectError(
					`MCP server ${serverName} has no compatible protocol version (server: ${error.supported.join(", ")})`,
					{ cause: error, phase: "protocol", serverName },
				);
			throw error;
		}
		const modern = client.getProtocolEra() === "modern";
		protocol.version = modern ? client.getNegotiatedProtocolVersion() : undefined;
		protocol.legacy = !modern;
		protocol.resolveStdioDiagnostics?.(modern);
		protocol.activateRequests?.();
		options.logger.info(
			`MCP server ${serverName} negotiated: era=${modern ? "modern" : "legacy"} version=${client.getNegotiatedProtocolVersion()}`,
		);
		mcpSubscriptions(client).start();
	};
	const listResources = client.listResources.bind(client);
	client.listResources = async (params, requestOptions) => {
		const consume = mcpSubscriptions(client).beginResourcePage(params);
		const result = await listResources(params, requestOptions);
		consume(result);
		return result;
	};
	return { ...materialized, transport };
}
