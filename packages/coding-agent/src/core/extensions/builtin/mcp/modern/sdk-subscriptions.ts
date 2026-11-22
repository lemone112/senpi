import type {
	Client,
	JSONRPCNotification,
	McpSubscription,
	SubscriptionFilter,
} from "../../../../../vendor/mcp/client/index.mjs";
import { dispatchMcpNotification } from "../notification-schemas.ts";
import { physicalMcpClient } from "../request-origin.ts";
import { mcpElapsedClock, mcpInterrupted, onMcpClientClose } from "../wrap.ts";
import { McpMrtrError } from "./errors.ts";
import { isRecord } from "./form-schema.ts";
import { type McpTask, parseMcpTask } from "./tasks.ts";

export interface McpTaskSubscription {
	/** False means an explicit ACK omitted this ID. Transport failure rejects. */
	readonly ready: Promise<boolean>;
	take(): McpTask | undefined;
	next(signal: AbortSignal): Promise<McpTask>;
	close(): void;
}
type Watcher = {
	id: string;
	ready: ReturnType<typeof Promise.withResolvers<boolean>>;
	authorize?: () => Promise<void>;
	honored?: boolean;
	latest?: McpTask;
	waiting?: ReturnType<typeof Promise.withResolvers<McpTask>>;
	error?: Error;
};
type Stream = {
	filter: SubscriptionFilter & { taskIds?: string[] };
	abort: AbortController;
	subscription?: McpSubscription;
	queued?: JSONRPCNotification[];
};
const coordinators = new WeakMap<Client, McpSubscriptions>();

/** One SDK listen stream per physical connection. Every session has its own receiver. */
export function mcpSubscriptions(client: Client): McpSubscriptions {
	const physical = physicalMcpClient(client);
	let coordinator = coordinators.get(physical);
	if (!coordinator) {
		coordinator = new McpSubscriptions(physical);
		coordinators.set(physical, coordinator);
	}
	return coordinator;
}

export class McpSubscriptions {
	readonly #client: Client;
	readonly #watchers = new Set<Watcher>();
	#filter: SubscriptionFilter = {};
	#active?: Stream;
	#opening?: Stream;
	#closed = false;
	#retry = 0;
	#timer?: ReturnType<typeof setTimeout>;
	#resourceSweep: string[] = [];
	#resourceCursor?: string;
	#resourceGeneration = 0;
	constructor(client: Client) {
		this.#client = client;
		onMcpClientClose(client, () => this.dispose());
	}
	start(): void {
		if (this.#client.getProtocolEra() !== "modern") return;
		const capabilities = this.#client.getServerCapabilities();
		this.#filter = {
			...(capabilities?.tools?.listChanged ? { toolsListChanged: true } : {}),
			...(capabilities?.resources?.listChanged ? { resourcesListChanged: true } : {}),
			...(capabilities?.prompts?.listChanged ? { promptsListChanged: true } : {}),
			...this.#filter,
		};
		this.#open();
	}
	beginResourcePage(
		params: { cursor?: string } | undefined,
	): (result: { resources: { uri: string }[]; nextCursor?: string }) => void {
		if (!this.#client.getServerCapabilities()?.resources?.subscribe) return () => {};
		if (!params?.cursor) {
			this.#resourceGeneration++;
			this.#resourceSweep = [];
			this.#resourceCursor = undefined;
		}
		const generation = this.#resourceGeneration;
		const expected = !params?.cursor || params.cursor === this.#resourceCursor;
		let consumed = false;
		return (result) => {
			if (consumed || !expected || generation !== this.#resourceGeneration) return;
			consumed = true;
			this.#resourceSweep.push(...result.resources.map((resource) => resource.uri));
			this.#resourceCursor = result.nextCursor;
			if (!result.nextCursor) {
				this.#filter.resourceSubscriptions = [...new Set(this.#resourceSweep)].sort();
				this.#open();
			}
		};
	}
	watchTask(id: string, signal: AbortSignal, authorize?: () => Promise<void>): McpTaskSubscription {
		const watcher: Watcher = { id, ready: Promise.withResolvers<boolean>(), authorize };
		void watcher.ready.promise.catch(() => {});
		this.#watchers.add(watcher);
		const close = () => {
			if (!this.#watchers.delete(watcher)) return;
			signal.removeEventListener("abort", close);
			const error = new McpMrtrError("MCP_MRTR_CONTEXT_CHANGED");
			watcher.error = error;
			watcher.ready.reject(error);
			watcher.waiting?.reject(error);
			this.#open();
		};
		signal.addEventListener("abort", close, { once: true });
		if (signal.aborted || this.#closed) close();
		else this.#open();
		const take = () => {
			const task = watcher.latest;
			watcher.latest = undefined;
			return task;
		};
		return {
			ready: watcher.ready.promise,
			take,
			next: async (activeSignal) => {
				if (watcher.error) throw watcher.error;
				const task = take();
				if (task) return task;
				watcher.waiting ??= Promise.withResolvers<McpTask>();
				try {
					return await mcpInterrupted(watcher.waiting.promise, activeSignal);
				} finally {
					watcher.waiting = undefined;
				}
			},
			close,
		};
	}
	dispose(): void {
		if (this.#closed) return;
		this.#closed = true;
		if (this.#timer) mcpElapsedClock.cancel(this.#timer);
		this.#opening?.abort.abort();
		this.#active?.abort.abort();
		this.#failWatchers(new McpMrtrError("MCP_MRTR_CONTEXT_CHANGED"));
	}
	#failWatchers(error: Error, ids?: readonly string[]): void {
		for (const watcher of this.#watchers) {
			if (ids && !ids.includes(watcher.id)) continue;
			watcher.error = error;
			watcher.ready.reject(error);
			watcher.waiting?.reject(error);
		}
	}
	#open(): void {
		if (this.#closed || this.#client.getProtocolEra() !== "modern") return;
		const ids = [
			...new Set([...this.#watchers].filter((watcher) => !watcher.error).map((watcher) => watcher.id)),
		].sort();
		const filter = { ...this.#filter, ...(ids.length ? { taskIds: ids } : {}) };
		const current = this.#opening ?? this.#active;
		if (JSON.stringify(current?.filter) === JSON.stringify(filter)) {
			if (current?.subscription) this.#acknowledge(current);
			return;
		}
		this.#opening?.abort.abort();
		if (!Object.values(filter).some((value) => value === true || (Array.isArray(value) && value.length > 0))) {
			this.#active?.abort.abort();
			this.#active = undefined;
			this.#opening = undefined;
			return;
		}
		const stream: Stream = { filter, abort: new AbortController() };
		this.#opening = stream;
		void this.#listen(stream)
			.then(
				(subscription) => {
					if (!subscription) return;
					stream.subscription = subscription;
					if (stream.abort.signal.aborted || this.#closed || this.#opening !== stream) return subscription.close();
					const previous = this.#active;
					this.#opening = undefined;
					this.#active = stream;
					this.#acknowledge(stream);
					previous?.abort.abort();
					void subscription.closed.then((cause) => {
						// SDK receiver failures also close locally. Only our abort proves
						// an intentional stop; every other lost stream ends observation.
						if (this.#closed || this.#active !== stream || stream.abort.signal.aborted) return;
						const error = new McpMrtrError("MCP_MRTR_TRANSPORT_FAILED");
						if (cause === "graceful") {
							this.#active = undefined;
							this.#failWatchers(error, stream.filter.taskIds);
						} else this.#failed(stream, error);
					});
					if (
						!Object.values(subscription.honoredFilter).some(
							(value) => value === true || (Array.isArray(value) && value.length > 0),
						)
					)
						stream.abort.abort();
					for (const notification of stream.queued ?? []) this.#receive(stream, notification);
					stream.queued = undefined;
				},
				(error: unknown) => {
					if (this.#closed || this.#opening !== stream || stream.abort.signal.aborted) return;
					this.#opening = undefined;
					this.#failed(stream, error instanceof Error ? error : new Error(String(error)));
				},
			)
			.catch((error: unknown) => this.#failed(stream, error instanceof Error ? error : new Error(String(error))));
	}
	async #listen(stream: Stream): Promise<McpSubscription | undefined> {
		const watchers = [...this.#watchers].filter(
			(watcher) => !watcher.error && stream.filter.taskIds?.includes(watcher.id),
		);
		await Promise.all(
			watchers.map(async (watcher) => {
				try {
					await watcher.authorize?.();
				} catch (error) {
					watcher.error = error instanceof Error ? error : new Error(String(error));
					watcher.ready.reject(watcher.error);
					watcher.waiting?.reject(watcher.error);
				}
			}),
		);
		if (this.#closed || stream.abort.signal.aborted || this.#opening !== stream) return;
		if (watchers.some((watcher) => watcher.error || !this.#watchers.has(watcher))) {
			this.#opening = undefined;
			stream.abort.abort();
			this.#open();
			return;
		}
		return this.#client.listen(stream.filter, {
			signal: stream.abort.signal,
			onNotification: (notification) => this.#receive(stream, notification),
		});
	}
	#acknowledge(stream: Stream): void {
		const offered = stream.subscription?.honoredFilter.taskIds;
		const honored = Array.isArray(offered) ? offered.filter((id): id is string => typeof id === "string") : [];
		for (const watcher of this.#watchers) {
			if (watcher.error || !stream.filter.taskIds?.includes(watcher.id)) continue;
			const included = honored.includes(watcher.id);
			if (watcher.honored && !included) {
				// A fulfilled ready promise cannot report that its stream was lost.
				// End this observation so durable recovery can acquire the new ACK.
				watcher.error = new McpMrtrError("MCP_MRTR_TRANSPORT_FAILED");
				watcher.waiting?.reject(watcher.error);
			}
			watcher.honored = included;
			watcher.ready.resolve(included);
		}
	}
	#receive(stream: Stream, notification: JSONRPCNotification): void {
		if (this.#closed || stream.abort.signal.aborted || (stream !== this.#active && stream !== this.#opening)) return;
		if (!stream.subscription) {
			(stream.queued ??= []).push(notification);
			return;
		}
		const honored = stream.subscription.honoredFilter;
		if (notification.method !== "notifications/tasks") {
			const filter = {
				"notifications/tools/list_changed": "toolsListChanged",
				"notifications/resources/list_changed": "resourcesListChanged",
				"notifications/prompts/list_changed": "promptsListChanged",
			} as const;
			const key = filter[notification.method as keyof typeof filter];
			const uri = notification.params?.uri;
			if (
				!(key && honored[key] === true) &&
				!(
					notification.method === "notifications/resources/updated" &&
					typeof uri === "string" &&
					honored.resourceSubscriptions?.includes(uri)
				)
			)
				return;
			this.#retry = 0;
			dispatchMcpNotification(this.#client, notification);
			return;
		}
		const params = notification.params;
		if (!isRecord(params) || typeof params.taskId !== "string" || !stream.filter.taskIds?.includes(params.taskId))
			return;
		if (!Array.isArray(honored.taskIds) || !honored.taskIds.includes(params.taskId)) return;
		const task = parseMcpTask(params, params.taskId);
		this.#retry = 0;
		for (const watcher of this.#watchers) {
			if (watcher.id !== task.taskId || watcher.error) continue;
			if (watcher.waiting) {
				const waiting = watcher.waiting;
				watcher.waiting = undefined;
				waiting.resolve(task);
			} else if (!watcher.latest || !["completed", "failed", "cancelled"].includes(watcher.latest.status))
				watcher.latest = task;
		}
	}
	#failed(stream: Stream, error: Error): void {
		if (this.#closed || stream.abort.signal.aborted) return;
		if (this.#active === stream) this.#active = undefined;
		if (this.#opening === stream) this.#opening = undefined;
		stream.abort.abort();
		const stillHonored = this.#active?.subscription?.honoredFilter.taskIds;
		const affected = stream.filter.taskIds?.filter(
			(id) => !Array.isArray(stillHonored) || !stillHonored.includes(id),
		);
		this.#failWatchers(error, affected ?? []);
		if (this.#timer || this.#closed) return;
		this.#timer = mcpElapsedClock.schedule(
			() => {
				this.#timer = undefined;
				this.#open();
			},
			Math.min(30_000, 1000 * 2 ** Math.min(this.#retry++, 5)),
		);
		this.#timer.unref?.();
	}
}
