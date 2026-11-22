/**
 * Lazy boundary for the pinned modular MCP SDK in src/vendor/mcp.
 *
 * Every CLI start used to parse, compile and evaluate the SDK because the MCP builtin is statically reachable from
 * the builtin barrel. Nothing in the SDK is needed until a run actually
 * connects a transport, builds a client, registers a request handler or drives
 * the OAuth flow — all of which happen inside already-async code paths — so
 * each SDK submodule loads on first use instead of at process start.
 *
 * Follows the repository's documented lazy-boundary pattern
 * (`packages/ai/src/api/*.lazy.ts`, `webfetch/webfetch/content.lazy.ts`);
 * `test/suite/regressions/1781-lazy-mcp-sdk.test.ts` fails if a static edge to
 * the SDK reappears in `dist/main.js`.
 */

type SdkAuthModule = typeof import("../../../../vendor/mcp/client/index.mjs");

/**
 * Loads once and caches. Concurrent callers share the in-flight promise; a
 * failed load is not cached, so a later attempt can retry.
 */
function memoizeLoader<T>(load: () => Promise<T>): () => Promise<T> {
	let loaded: T | undefined;
	let loading: Promise<T> | undefined;
	return (): Promise<T> => {
		if (loaded !== undefined) return Promise.resolve(loaded);
		loading ??= load()
			.then((module) => {
				loaded = module;
				return module;
			})
			.finally(() => {
				loading = undefined;
			});
		return loading;
	};
}

/** `Client` — the MCP client class, built once per transport connection. */
export const loadMcpSdkClient = memoizeLoader(() => import("../../../../vendor/mcp/client/index.mjs"));

/** Validate the caller's final contract through its own Standard Schema implementation. */
export async function parseMcpResult<T>(
	schema: import("../../../../vendor/mcp/client/index.mjs").StandardSchemaV1<unknown, T>,
	value: unknown,
) {
	const parsed = await schema["~standard"].validate(value);
	return parsed.issues ? { success: false as const } : { success: true as const, data: parsed.value };
}

/** `StdioClientTransport` + `getDefaultEnvironment` — stdio servers and the stdio diagnostic rerun. */
export const loadMcpSdkStdioTransport = memoizeLoader(() => import("../../../../vendor/mcp/client/stdio.mjs"));

/** SDK-owned protocol schemas for elicitation and modern request results. */
export const loadMcpSdkTypes = memoizeLoader(async () => ({
	...(await import("../../../../vendor/mcp/core/index.mjs")),
	...(await loadMcpSdkClient()),
}));

/** SDK-owned request defaults, loaded only by negotiated modern operations. */
export const loadMcpSdkProtocol = loadMcpSdkClient;

let authModule: SdkAuthModule | undefined;

/** OAuth 2.1 discovery, authorization, token exchange and refresh. */
export const loadMcpSdkAuth = memoizeLoader(async (): Promise<SdkAuthModule> => {
	const module = await loadMcpSdkClient();
	authModule = module;
	return module;
});

/**
 * `StreamableHTTPClientTransport`. Loading it also seats the auth module: the
 * HTTP transport is the only transport that raises the SDK's
 * `UnauthorizedError`, and {@link isMcpSdkUnauthorizedError} can only recognize
 * an instance once the class that produced it is cached here. The modular
 * client entry exports both transport and auth, so this is the same load.
 */
export const loadMcpSdkStreamableHttpTransport = memoizeLoader(async () => {
	const [module] = await Promise.all([loadMcpSdkClient(), loadMcpSdkAuth()]);
	return module;
});

/**
 * Whether `error` is the SDK's `UnauthorizedError` (the signal that a server
 * needs OAuth). Synchronous on purpose — every caller is a plain error
 * predicate — and exact: an instance can only exist once the client entry has been
 * evaluated, and every path that can produce one awaits a loader above first.
 * The class carries no distinguishing `name`, so identity is the only check.
 */
export function isMcpSdkUnauthorizedError(error: unknown): boolean {
	return authModule !== undefined && error instanceof authModule.UnauthorizedError;
}
