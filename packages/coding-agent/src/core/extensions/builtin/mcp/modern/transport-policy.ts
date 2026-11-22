import { AsyncLocalStorage } from "node:async_hooks";
import type { Client, FetchLike, Transport } from "../../../../../vendor/mcp/client/index.mjs";
import { sanitizeModernMessage } from "./diagnostics.ts";
import { getModernDispatchGuard } from "./request.ts";

type Dispatch = { id?: string | number; guard?: (credential?: string) => void };

/** Host authority and private diagnostics around SDK I/O, without implementing protocol or framing. */
export class McpTransportPolicy {
	readonly #dispatch = new AsyncLocalStorage<Dispatch>();
	readonly #readCredential: () => string | undefined;
	constructor(readCredential: () => string | undefined) {
		this.#readCredential = readCredential;
	}
	readonly fetch: FetchLike = (url, init) => {
		this.#dispatch.getStore()?.guard?.(this.#readCredential());
		return fetch(url, init);
	};
	attach(transport: Transport, client: Client): void {
		const send = transport.send.bind(transport);
		transport.send = (message, options) => {
			const guard = "method" in message ? getModernDispatchGuard(message.params) : undefined;
			guard?.(this.#readCredential());
			return this.#dispatch.run({ id: "id" in message ? message.id : undefined, guard }, () =>
				send(message, options),
			);
		};
		const connect = client.connect.bind(client);
		client.connect = async (current, options) => {
			await connect(current, options);
			const deliver = transport.onmessage;
			transport.onmessage = (message, extra) => {
				if ("result" in message && message.result.nextCursor === null) delete message.result.nextCursor;
				if (client.getProtocolEra() !== "modern") {
					deliver?.(message, extra);
					return;
				}
				const dispatch = this.#dispatch.getStore();
				if (
					transport.hasPerRequestStream &&
					dispatch?.id !== undefined &&
					"id" in message &&
					message.id !== dispatch.id
				) {
					deliver?.({
						jsonrpc: "2.0",
						id: dispatch.id,
						error: { code: -32603, message: "MCP response identifier mismatch" },
					});
					return;
				}
				const safe = sanitizeModernMessage(message);
				if (safe) deliver?.(safe, extra);
			};
		};
	}
}
