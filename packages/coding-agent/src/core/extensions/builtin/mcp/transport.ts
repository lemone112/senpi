import type { Client } from "../../../../vendor/mcp/client/index.mjs";
import type { Transport } from "../../../../vendor/mcp/client/index.mjs";
import type { McpOAuthProvider } from "./auth/oauth-provider.ts";
import type { McpServerConfig } from "./config-schema.ts";
import type { McpElicitationUiProvider } from "./elicitation.ts";
import { ConnectError, TimeoutError } from "./errors.ts";
import type { McpLogger } from "./log.ts";
import { delay } from "./process-tree.ts";
import type { ProjectMcpMaterialization } from "./project-skill-policy.ts";
import type { McpMaterializedTransport, McpTransportSpec } from "./transport-sdk.ts";
import { errorMessage, mcpTransportSpec } from "./transport-spec.ts";
import { type McpAsyncErrorSink, mcpInterrupted, safeInterval, safeTimer } from "./wrap.ts";

export type McpTransportConnection = {
	readonly serverName: string;
	readonly client: Client;
	readonly transport: Transport;
	readonly transportKind: "stdio" | "http";
	/** The configured HTTP endpoint; undefined for stdio. */
	readonly endpointUrl?: URL;
	readonly connectTimeoutMs: number;
	readonly asyncErrorSink: McpAsyncErrorSink;
	/**
	 * Loads the SDK and builds the transport + client. Idempotent and
	 * single-flight; `client`/`transport` throw until it has resolved.
	 */
	materialize(): Promise<void>;
	captureRootPid?(): void;
	getRootPid(): number | null;
	closeTransport(): Promise<void>;
};

export type CreateMcpTransportOptions = {
	readonly projectPolicy?: boolean;
	readonly resolveProjectPolicy?: () => Promise<ProjectMcpMaterialization>;
	readonly serverName: string;
	readonly config: McpServerConfig;
	readonly logger: McpLogger;
	readonly env?: Record<string, string | undefined>;
	readonly elicitationUiProvider?: McpElicitationUiProvider;
	readonly elicitationEnabled?: boolean;
	// Present only when OAuth is the resolved auth mode for this server.
	readonly authProvider?: McpOAuthProvider;
	/** Re-reads a declaring server's references for this transport (senpi#3858). */
	readonly resolveConfig?: () => Promise<McpServerConfig>;
};

const SHUTDOWN_CLOSE_WAIT_MS = 1400;

export function createMcpTransport(options: CreateMcpTransportOptions): McpTransportConnection {
	const spec = mcpTransportSpec(options);
	return createConnection(options, spec, options.config.connectTimeoutMs);
}

export async function connectMcpTransport(connection: McpTransportConnection): Promise<void> {
	let timedOut = false;
	const started = performance.now();
	const controller = new AbortController();
	const captureInterval = safeInterval(
		"transport.captureRootPid",
		25,
		() => connection.captureRootPid?.(),
		connection.asyncErrorSink,
	);
	const timeout = safeTimer(
		"transport.connectTimeout",
		connection.connectTimeoutMs,
		() => {
			timedOut = true;
			connection.captureRootPid?.();
			controller.abort();
		},
		connection.asyncErrorSink,
	);
	const remaining = () => {
		const duration = connection.connectTimeoutMs - (performance.now() - started);
		if (duration <= 0) {
			timedOut = true;
			controller.abort();
		}
		controller.signal.throwIfAborted();
		return Math.max(1, Math.ceil(duration));
	};
	try {
		await mcpInterrupted(connection.materialize(), controller.signal);
		const timeoutMs = remaining();
		await mcpInterrupted(
			connection.client.connect(connection.transport, {
				signal: controller.signal,
				timeout: timeoutMs,
			}),
			controller.signal,
		);
		remaining();
	} catch (error) {
		await shutdownMcpTransport(connection).catch(() => undefined);
		if (error instanceof ConnectError && error.phase === "protocol") throw error;
		if (timedOut) {
			throw new TimeoutError(
				`MCP server ${connection.serverName} timed out during connect after ${connection.connectTimeoutMs}ms`,
				{ cause: error, phase: "connect", retriable: true, serverName: connection.serverName },
			);
		}
		const reason = crossOriginRedirectReason(error, connection.endpointUrl) ?? errorMessage(error);
		throw new ConnectError(`MCP server ${connection.serverName} failed during connect: ${reason}`, {
			cause: error,
			phase: "connect",
			retriable: true,
			serverName: connection.serverName,
		});
	} finally {
		clearInterval(captureInterval);
		clearTimeout(timeout);
	}
}

export async function shutdownMcpTransport(connection: McpTransportConnection): Promise<void> {
	// SDK stdio invokes the host process-tree policy for every child, including
	// disposable probes. Keep one shutdown path instead of reaping the session twice.
	await Promise.race([connection.closeTransport(), delay(SHUTDOWN_CLOSE_WAIT_MS)]);
}

function createConnection(
	options: CreateMcpTransportOptions,
	spec: McpTransportSpec,
	connectTimeoutMs: number,
): McpTransportConnection {
	const asyncErrorSink: McpAsyncErrorSink = { logger: options.logger };
	let materialized: McpMaterializedTransport | undefined;
	let pending: Promise<McpMaterializedTransport> | undefined;
	const abort = new AbortController();
	let lastRootPid: number | null = null;
	const captureRootPid = (): void => {
		lastRootPid = materialized?.readPid() ?? lastRootPid;
	};
	const built = (): McpMaterializedTransport => {
		if (materialized === undefined) {
			throw new ConnectError(`MCP server ${options.serverName} transport is not started`, {
				phase: "create",
				serverName: options.serverName,
			});
		}
		return materialized;
	};
	return {
		asyncErrorSink,
		captureRootPid,
		get client(): Client {
			return built().client;
		},
		closeTransport: async (): Promise<void> => {
			abort.abort();
			await materialized?.close();
		},
		connectTimeoutMs,
		getRootPid: (): number | null => {
			captureRootPid();
			return materialized?.readPid() ?? lastRootPid;
		},
		materialize: async (): Promise<void> => {
			const materializeWith = (current: McpTransportSpec) =>
				import("./modern/dispatch.ts").then(({ materializeNegotiatedTransport }) =>
					materializeNegotiatedTransport(
						{
							elicitationUiProvider: options.elicitationUiProvider,
							elicitationEnabled: options.elicitationEnabled,
							logger: options.logger,
							onStart: captureRootPid,
							sink: asyncErrorSink,
							spec: current,
						},
						options.serverName,
						connectTimeoutMs,
						abort.signal,
					),
				);
			const { resolveConfig } = options;
			pending ??=
				resolveConfig === undefined
					? materializeWith(spec)
					: resolveConfig().then((config) => materializeWith(mcpTransportSpec({ ...options, config })));
			materialized = await pending;
			if (abort.signal.aborted) {
				await materialized.close();
				abort.signal.throwIfAborted();
			}
		},
		serverName: options.serverName,
		get transport(): Transport {
			return built().transport;
		},
		transportKind: spec.kind,
		...(spec.kind === "http" ? { endpointUrl: spec.url } : {}),
	};
}

// The SDK (1.32+) refuses a redirect to another origin and reports `Redirect to <target> not followed` with a
// 3xx code. senpi keeps that default (senpi#2940); this names both origins and the rule so the user can fix the URL.
const UNFOLLOWED_REDIRECT = /Redirect to (\S+) not followed/;
function crossOriginRedirectReason(error: unknown, endpoint: URL | undefined): string | undefined {
	if (endpoint === undefined || !(error instanceof Error)) return undefined;
	const code =
		(error as { data?: { status?: unknown }; code?: unknown }).data?.status ?? (error as { code?: unknown }).code;
	if (typeof code !== "number" || code < 300 || code >= 400) return undefined;
	const target = UNFOLLOWED_REDIRECT.exec(error.message)?.[1];
	if (target === undefined) return undefined;
	let targetOrigin: string;
	try {
		targetOrigin = new URL(target).origin;
	} catch (parseError) {
		if (parseError instanceof TypeError) return undefined;
		throw parseError;
	}
	// The SDK refuses some same-origin redirects too (a POST answered with 301-303, added userinfo); keep its text.
	if (targetOrigin === endpoint.origin) return undefined;
	return `the endpoint at ${endpoint.origin} redirected to ${targetOrigin}, and senpi only follows redirects within the same origin, so credentials and requests never move to another server without your say-so. Point the server's url at ${target} if that is where it now lives.`;
}
