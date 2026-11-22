import { Gt as SdkHttpError, N as scanXMcpHeaderDeclarations, Ut as SdkError, Wt as SdkErrorCode, at as ProtocolError, j as buildMcpParamHeaders, k as HEADER_MISMATCH_ERROR_CODE, kt as SUBSCRIPTION_ID_META_KEY, lt as ProtocolErrorCode, y as DEFAULT_REQUEST_TIMEOUT_MSEC } from "../../src.mjs";
import { a as detectProbeTransportKind, i as detectProbeEnvironment, n as clientInternals, o as isAuthSeamEscape } from "../../public.mjs";
import { DELIVERY_ERROR_CATEGORIES, DELIVERY_MODES, EVENTS_ACTIVE_NOTIFICATION, EVENTS_ACTIVE_NOTIFICATION as EVENTS_ACTIVE_NOTIFICATION$1, EVENTS_ERROR_NOTIFICATION, EVENTS_EVENT_NOTIFICATION, EVENTS_EVENT_NOTIFICATION as EVENTS_EVENT_NOTIFICATION$1, EVENTS_EXTENSION_ID, EVENTS_EXTENSION_ID as EVENTS_EXTENSION_ID$1, EVENTS_HEARTBEAT_NOTIFICATION, EVENTS_HEARTBEAT_NOTIFICATION as EVENTS_HEARTBEAT_NOTIFICATION$1, EVENTS_LIST_METHOD, EVENTS_LIST_METHOD as EVENTS_LIST_METHOD$1, EVENTS_POLL_METHOD, EVENTS_POLL_METHOD as EVENTS_POLL_METHOD$1, EVENTS_STREAM_METHOD, EVENTS_STREAM_METHOD as EVENTS_STREAM_METHOD$1, EVENTS_SUBSCRIBE_METHOD, EVENTS_SUBSCRIBE_METHOD as EVENTS_SUBSCRIBE_METHOD$1, EVENTS_TERMINATED_NOTIFICATION, EVENTS_TERMINATED_NOTIFICATION as EVENTS_TERMINATED_NOTIFICATION$1, EVENTS_UNSUBSCRIBE_METHOD, EVENTS_UNSUBSCRIBE_METHOD as EVENTS_UNSUBSCRIBE_METHOD$1, EventNotificationParamsSchema, EventOccurrenceSchema, EventsActiveNotificationParamsSchema, EventsHeartbeatNotificationParamsSchema, EventsTerminatedNotificationParamsSchema, ListEventsResultSchema, PollEventsResultSchema, SubscribeEventsResultSchema, UnsubscribeEventsResultSchema, WEBHOOK_SUBSCRIPTION_ID_HEADER, WEBHOOK_SUBSCRIPTION_ID_HEADER as WEBHOOK_SUBSCRIPTION_ID_HEADER$1, WebhookControlBodySchema, WebhookVerificationBodySchema, eventsCapabilityOf } from "../../../core/ext/events/index.mjs";

//#region src/ext/events/errors.ts
/**
* No delivery mode the event type offers is usable by this client: webhook
* needs the `webhook` option, and a forced `delivery` narrows the client to
* that one mode.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
var NoCompatibleDeliveryModeError = class extends SdkError {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.NoCompatibleDeliveryModeError" });
	}
	eventName;
	/** The modes the event type's descriptor lists. */
	offered;
	/** The modes this client could use for the request. */
	usable;
	constructor(eventName, offered, usable) {
		super(SdkErrorCode.CapabilityNotSupported, `No delivery mode fits event type '${eventName}': the server offers ${offered.join(", ")}; this client can use ${usable.length > 0 ? usable.join(", ") : "none"}`, {
			eventName,
			offered,
			usable
		});
		this.name = "NoCompatibleDeliveryModeError";
		this.eventName = eventName;
		this.offered = offered;
		this.usable = usable;
	}
};

//#endregion
//#region ../core-internal/src/ext/events/canonicalJson.ts
function serialize(json) {
	if (Array.isArray(json)) return `[${json.map((item) => serialize(item)).join(",")}]`;
	if (typeof json !== "object" || json === null) return JSON.stringify(json);
	return `{${Object.keys(json).toSorted().map((name) => `${JSON.stringify(name)}:${serialize(json[name])}`).join(",")}}`;
}
/** `JSON.stringify(value)` with object keys sorted by UTF-16 code unit at every depth; `TypeError` when there is no JSON text. */
function canonicalJson(value) {
	const text = JSON.stringify(value);
	if (text === void 0) throw new TypeError("canonicalJson: the value has no JSON text");
	return serialize(JSON.parse(text));
}

//#endregion
//#region ../core-internal/src/ext/events/codes.ts
/** The provisional JSON-RPC code of each {@linkcode EventsErrorKind} (SEP-3415 open question 5 may renumber them). */
const EVENTS_ERROR_CODES = {
	invalidParams: -32602,
	notFound: -32023,
	forbidden: -32024,
	resourceExhausted: -32025,
	unsupported: -32026,
	callbackEndpointError: -32027
};

//#endregion
//#region ../core-internal/src/ext/events/errors.ts
function kindOf(code) {
	return Object.keys(EVENTS_ERROR_CODES).find((kind) => EVENTS_ERROR_CODES[kind] === code);
}
/**
* An Events (SEP-3415) error. It crosses the wire as an error response, and inside
* `notifications/events/error`, `notifications/events/terminated` and the webhook `terminated` body.
*
* Branch on {@linkcode EventsError.kind}: it is the API. The inherited `code` is provisional
* (SEP-3415 open question 5 may renumber these errors or fold them into `-32602` with typed `data`).
* `instanceof` checks are brand-matched and work across separately bundled copies of the SDK.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
var EventsError = class EventsError extends ProtocolError {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.EventsError" });
	}
	constructor(kind, message, data) {
		super(EVENTS_ERROR_CODES[kind], message, data);
	}
	/** What went wrong. */
	get kind() {
		return kindOf(this.code);
	}
	/**
	* The `EventsError` for a `ProtocolError` received from an `events/*` request, by its code;
	* `undefined` for a code outside the Events error table. Data that is not an object is dropped.
	*/
	static fromProtocolError(error) {
		const kind = kindOf(error.code);
		if (kind === void 0) return void 0;
		const { data } = error;
		const objectData = typeof data === "object" && data !== null && !Array.isArray(data) ? data : void 0;
		return new EventsError(kind, error.message, objectData);
	}
};

//#endregion
//#region ../core-internal/src/ext/events/webhookSignature.ts
const SECRET_PREFIX = "whsec_";
const PADDED_BASE64 = /^(?:[\d+/A-Za-z]{4})*(?:[\d+/A-Za-z]{2}==|[\d+/A-Za-z]{3}=)?$/;
const encoder = new TextEncoder();
function toBase64(bytes) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCodePoint(byte);
	return btoa(binary);
}
function randomBytes(length) {
	return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
async function hmacSignatures(secrets, webhookId, timestampSeconds, body) {
	const content = encoder.encode(`${webhookId}.${timestampSeconds}.${body}`);
	return Promise.all(secrets.map(async (secret) => {
		const key = await globalThis.crypto.subtle.importKey("raw", new Uint8Array(secret), {
			name: "HMAC",
			hash: "SHA-256"
		}, false, ["sign"]);
		return toBase64(new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, content)));
	}));
}
/** The bytes of a Standard Webhooks secret: `whsec_` and padded base64 of 24 to 64 bytes; otherwise `undefined`. */
function parseWebhookSecret(secret) {
	if (!secret.startsWith(SECRET_PREFIX)) return void 0;
	const encoded = secret.slice(6);
	if (!PADDED_BASE64.test(encoded)) return void 0;
	const bytes = Uint8Array.from(atob(encoded), (char) => char.codePointAt(0));
	return bytes.length >= 24 && bytes.length <= 64 ? bytes : void 0;
}
/** A new Standard Webhooks secret: `whsec_` and base64 of 32 random bytes. */
function generateWebhookSecret() {
	return `${SECRET_PREFIX}${toBase64(randomBytes(32))}`;
}
/** Whether any `v1,` entry of a `webhook-signature` header matches the raw body under any of the secrets. */
async function verifyWebhookSignature(secrets, webhookId, timestampSeconds, rawBody, signatureHeader) {
	const expected = await hmacSignatures(secrets, webhookId, timestampSeconds, rawBody);
	return signatureHeader.split(" ").filter((entry) => entry.startsWith("v1,")).map((entry) => entry.slice(3)).some((signature) => expected.some((candidate) => timingSafeEqualString(signature, candidate)));
}
/** Whether two strings are equal, in time that does not depend on where they differ. */
function timingSafeEqualString(a, b) {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let index = 0; index < a.length; index++) difference |= a.codePointAt(index) ^ b.codePointAt(index);
	return difference === 0;
}

//#endregion
//#region src/ext/events/recovery.ts
const MAX_TIMER_DELAY_MS = 2147483647;
const RETRY_BASE_MS = 1e3;
const RETRY_MAX_MS = 3e4;
const RETRY_REPORT_INTERVAL_MS = 6e4;
const FINAL_CODES = new Set([ProtocolErrorCode.MethodNotFound, ProtocolErrorCode.InvalidParams]);
function endsSubscription(error) {
	return isAuthSeamEscape(error) || error instanceof ProtocolError && FINAL_CODES.has(error.code);
}
function refusesSubscription(error) {
	if (endsSubscription(error)) return true;
	if (error instanceof SdkHttpError) return !(error.status >= 500 || error.status === 429);
	return error instanceof EventsError && !isVerificationLimit(error) || error instanceof SdkError || isHeaderMismatch(error);
}
function isVerificationLimit(error) {
	return error instanceof EventsError && error.kind === "resourceExhausted" && error.data?.limit === "verification";
}
function retryAfterOf(error) {
	if (!isVerificationLimit(error)) return void 0;
	const retryAfterMs = error.data.retryAfterMs;
	return typeof retryAfterMs === "number" && retryAfterMs >= 0 ? retryAfterMs : void 0;
}
function isHeaderMismatch(error) {
	return error instanceof ProtocolError && error.code === HEADER_MISMATCH_ERROR_CODE;
}
function closedError(cause) {
	return new SdkError(SdkErrorCode.ConnectionClosed, "Connection closed", void 0, cause === void 0 ? void 0 : { cause });
}
function connectionClosed(connection, error) {
	if (error instanceof SdkError && error.code === SdkErrorCode.ConnectionClosed) return error;
	if (!(error instanceof SdkError && error.code === SdkErrorCode.NotConnected) && connection.client.transport !== void 0) return void 0;
	return closedError(error);
}
function isSchemaChange(error) {
	return error instanceof EventsError && error.kind === "unsupported" && error.data?.reason === "schema_changed";
}
function isModeRefusal(error) {
	return error instanceof EventsError && error.kind === "unsupported" && error.data?.feature === "deliveryMode";
}
function recoveryFor(error) {
	if (endsSubscription(error)) return "fail";
	if (isHeaderMismatch(error)) return "mismatch";
	if (!(error instanceof EventsError) || isVerificationLimit(error)) return "retry";
	return error.kind === "notFound" || isSchemaChange(error) ? "relist" : "fail";
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
function reportGap(subscription, connection, cursor) {
	try {
		subscription.onGap?.(cursor);
	} catch (error) {
		connection.report(error);
	}
}
async function requireOffered(connection, name, mode, signal) {
	try {
		await connection.list(void 0, { signal });
	} catch (error) {
		throw connectionClosed(connection, error) ?? error;
	}
	const descriptor = connection.descriptor(name);
	if (descriptor === void 0) throw new EventsError("notFound", "Event type not found", { kind: "event" });
	if (!descriptor.delivery.includes(mode)) throw new NoCompatibleDeliveryModeError(name, descriptor.delivery, [mode]);
}
async function stillOffered(connection, name, mode, signal) {
	try {
		await connection.list(void 0, { signal });
	} catch (error) {
		if (endsSubscription(error)) throw error;
		return;
	}
	return connection.descriptor(name)?.delivery.includes(mode) === true;
}
function jitteredDelay(attempt) {
	return Math.random() * Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
}
var DriverLoop = class {
	#context;
	#mode;
	#abort = new AbortController();
	#cursor;
	#maxAgeMs;
	#first = true;
	#schemaChanged = false;
	#reset = false;
	#stopped = false;
	#closed = false;
	#settle = {
		resolve: () => {},
		reject: () => {}
	};
	#hooks = {};
	#wake;
	#running = Promise.resolve();
	#retried = 0;
	#lastRetried;
	#reportedAt;
	#report;
	constructor(context, mode) {
		this.#context = context;
		this.#mode = mode;
		this.#cursor = context.subscription.cursor ?? null;
		this.#maxAgeMs = context.subscription.maxAgeMs;
	}
	get cursor() {
		return this.#cursor;
	}
	get maxAgeMs() {
		return this.#maxAgeMs;
	}
	get first() {
		return this.#first;
	}
	get signal() {
		return this.#abort.signal;
	}
	get ended() {
		return this.#stopped || this.#closed;
	}
	start(run, hooks = {}) {
		const first = new Promise((resolve, reject) => this.#settle = {
			resolve,
			reject
		});
		this.#hooks = hooks;
		const removeCloseListener = this.#context.connection.onClose(() => {
			this.#closed = true;
			this.#interrupt();
			hooks.closed?.();
			this.#fail(closedError());
		});
		this.#running = run().then(() => this.#settle.resolve(), (error) => this.#fail(error)).finally(removeCloseListener);
		return first;
	}
	async stop(cleanup) {
		this.#stopped = true;
		this.#abort.abort();
		this.#interrupt();
		clearTimeout(this.#report);
		await cleanup?.();
		await this.#running;
	}
	subscribed() {
		this.#first = false;
		this.#settle.resolve();
	}
	succeeded(cursor, truncated) {
		const reset = this.#reset;
		this.#maxAgeMs = void 0;
		this.#schemaChanged = false;
		this.#reset = false;
		if (reset || truncated && cursor !== null) reportGap(this.#context.subscription, this.#context.connection, cursor);
	}
	setCursor(cursor) {
		this.#cursor = cursor;
		this.#context.queue.setCursor(cursor);
	}
	sleep(ms) {
		return new Promise((resolve) => {
			if (this.ended) return resolve();
			const wake = () => {
				clearTimeout(timer);
				this.#wake = void 0;
				resolve();
			};
			const timer = setTimeout(wake, Math.min(ms, MAX_TIMER_DELAY_MS));
			this.#wake = wake;
		});
	}
	wake() {
		this.#wake?.();
	}
	async recover(error) {
		const { connection, subscription } = this.#context;
		const closed = connectionClosed(connection, error);
		if (closed !== void 0) throw closed;
		if (this.#first) {
			if (isSchemaChange(error) && this.#cursor !== null) {
				try {
					await requireOffered(connection, subscription.name, this.#mode, this.#abort.signal);
				} catch (listError) {
					if (refusesSubscription(listError)) throw listError;
					this.#restartFromNow();
					this.subscribed();
					this.#retrying(listError);
					return "retry";
				}
				this.#restartFromNow();
				return "restarted";
			}
			if (refusesSubscription(error)) throw error;
			this.subscribed();
			this.#retrying(error);
			return "retry";
		}
		const recovery = recoveryFor(error);
		if (recovery === "retry") {
			this.#retrying(error);
			return "retry";
		}
		if (recovery !== "relist") throw error;
		if (await stillOffered(connection, subscription.name, this.#mode, this.#abort.signal) === false) throw error;
		if (isSchemaChange(error)) this.#schemaChange();
		return "retry";
	}
	#restartFromNow() {
		this.#cursor = null;
		this.#reset = true;
	}
	#schemaChange() {
		if (this.#schemaChanged && this.#cursor !== null) this.#restartFromNow();
		this.#schemaChanged = true;
	}
	#retrying(error) {
		if (this.ended) return;
		const now = Date.now();
		if (this.#report === void 0 && (this.#reportedAt === void 0 || now - this.#reportedAt >= RETRY_REPORT_INTERVAL_MS)) {
			this.#reportedAt = now;
			this.#context.connection.report(new Error(`${this.#subject()} failed and is retried: ${messageOf(error)}`, { cause: error }));
			return;
		}
		this.#retried += 1;
		this.#lastRetried = error;
		this.#report ??= setTimeout(() => this.#reportRetried(), this.#reportedAt + RETRY_REPORT_INTERVAL_MS - now);
	}
	#reportRetried() {
		const retried = this.#retried;
		const latest = this.#lastRetried;
		this.#report = void 0;
		this.#reportedAt = Date.now();
		this.#retried = 0;
		this.#lastRetried = void 0;
		const failures = retried === 1 ? "failure" : "failures";
		this.#context.connection.report(new Error(`${this.#subject()}: ${retried} more retried ${failures} since the last report, the latest: ${messageOf(latest)}`, { cause: latest }));
	}
	#subject() {
		return `${this.#mode} subscription to '${this.#context.subscription.name}'`;
	}
	#interrupt() {
		this.#wake?.();
		this.#hooks.interrupt?.();
	}
	#fail(error) {
		clearTimeout(this.#report);
		this.#settle.reject(error);
		this.#context.queue.fail(error);
	}
};

//#endregion
//#region src/ext/events/poll.ts
const MAX_RETRY_DELAY_MS = 6e4;
var PollDriver = class {
	#context;
	#loop;
	#floorMs;
	#nextPollMs;
	constructor(context, floorMs) {
		this.#context = context;
		this.#loop = new DriverLoop(context, "poll");
		this.#floorMs = floorMs;
	}
	start() {
		return this.#loop.start(() => this.#run());
	}
	stop() {
		return this.#loop.stop();
	}
	async #run() {
		const loop = this.#loop;
		let failures = 0;
		while (!loop.ended) {
			let result;
			try {
				result = await this.#poll();
			} catch (error) {
				if (loop.ended) return;
				if (await loop.recover(error) === "restarted") continue;
				await loop.sleep(this.#retryDelay(failures++));
				continue;
			}
			if (loop.ended) return;
			failures = 0;
			this.#deliver(result);
			loop.subscribed();
			if (result.hasMore !== true) await loop.sleep(Math.max(result.nextPollMs ?? this.#floorMs, this.#floorMs));
		}
	}
	#poll() {
		const { name, arguments: args } = this.#context.subscription;
		const loop = this.#loop;
		const mirror = {
			name,
			...args !== void 0 && { arguments: args }
		};
		const params = {
			...mirror,
			cursor: loop.cursor,
			...loop.maxAgeMs !== void 0 && { maxAgeMs: loop.maxAgeMs }
		};
		return this.#context.connection.request(EVENTS_POLL_METHOD$1, params, PollEventsResultSchema, mirror, { signal: loop.signal });
	}
	#deliver(result) {
		const cursor = result.cursor ?? null;
		this.#nextPollMs = result.nextPollMs;
		this.#loop.succeeded(cursor, result.truncated === true);
		for (const event of result.events) this.#context.queue.push(event);
		this.#loop.setCursor(cursor);
	}
	#retryDelay(failures) {
		const base = Math.max(this.#floorMs, this.#nextPollMs ?? this.#floorMs);
		return Math.max(base, Math.min(MAX_RETRY_DELAY_MS, base * 2 ** failures));
	}
};

//#endregion
//#region src/ext/events/request.ts
function asEventsError(error) {
	if (!(error instanceof ProtocolError) || error instanceof EventsError) return error;
	return EventsError.fromProtocolError(error) ?? error;
}
var EventsConnection = class {
	client;
	#descriptors = /* @__PURE__ */ new Map();
	#closeListeners = /* @__PURE__ */ new Set();
	constructor(client) {
		this.client = client;
		clientInternals.onClose(client, () => {
			const listeners = [...this.#closeListeners];
			for (const listener of listeners) try {
				listener();
			} catch (error) {
				this.report(error);
			}
		});
	}
	onClose(listener) {
		this.#closeListeners.add(listener);
		return () => void this.#closeListeners.delete(listener);
	}
	report(error) {
		this.client.onerror?.(error instanceof Error ? error : new Error(String(error)));
	}
	descriptor(name) {
		return this.#descriptors.get(name)?.descriptor;
	}
	async list(cursor, options) {
		const fetchPage = (at) => this.request(EVENTS_LIST_METHOD$1, at === void 0 ? {} : { cursor: at }, ListEventsResultSchema, void 0, options);
		let result;
		if (cursor === void 0) {
			result = await clientInternals.walkPages(this.client, EVENTS_LIST_METHOD$1, fetchPage, (page) => page.events);
			delete result.nextCursor;
			this.#descriptors.clear();
		} else result = await fetchPage(cursor);
		result.events = result.events.filter((descriptor) => this.#cache(descriptor));
		return result;
	}
	paramHeadersFor(name, args) {
		const declarations = this.#mirroring() ? this.#descriptors.get(name)?.declarations : void 0;
		return declarations === void 0 || declarations.length === 0 ? {} : buildMcpParamHeaders(declarations, args);
	}
	async request(method, params, schema, mirror, options) {
		const send = () => {
			const headers = mirror === void 0 ? {} : this.paramHeadersFor(mirror.name, mirror.arguments);
			const sendOptions = Object.keys(headers).length === 0 ? options : {
				...options,
				headers: {
					...options?.headers,
					...headers
				}
			};
			return this.client.request({
				method,
				params
			}, schema, sendOptions);
		};
		try {
			try {
				return await send();
			} catch (error) {
				if (mirror === void 0 || !isHeaderMismatch(error)) throw error;
				await this.list(void 0, options);
				return await send();
			}
		} catch (error) {
			throw asEventsError(error);
		}
	}
	#mirroring() {
		return this.client.getProtocolEra() === "modern" && detectProbeEnvironment() !== "browser";
	}
	#cache(descriptor) {
		const scan = scanXMcpHeaderDeclarations(descriptor.inputSchema);
		const transport = this.client.transport;
		if (!scan.valid && transport !== void 0 && detectProbeTransportKind(transport) !== "stdio") {
			this.#descriptors.delete(descriptor.name);
			console.warn(`[mcp-sdk] excluding event type '${descriptor.name}' from events/list: invalid x-mcp-header declaration — ${scan.reason}`);
			return false;
		}
		this.#descriptors.set(descriptor.name, {
			descriptor,
			declarations: scan.valid ? scan.declarations : []
		});
		return true;
	}
};

//#endregion
//#region src/ext/events/push.ts
const DEAD_AFTER_HEARTBEATS = 3;
var PushUnavailableError = class extends Error {
	constructor(name, cause) {
		super(`${EVENTS_STREAM_METHOD$1} for '${name}' failed before its first ${EVENTS_ACTIVE_NOTIFICATION$1}; subscribing by poll instead`, { cause });
	}
};
function endingOf(end) {
	return end.cause === "remote" && end.error !== void 0 ? { error: asEventsError(end.error) } : {};
}
function withoutStreamId(event) {
	if (event._meta === void 0 || !(SUBSCRIPTION_ID_META_KEY in event._meta)) return event;
	const { _meta: meta, ...occurrence } = event;
	const rest = Object.fromEntries(Object.entries(meta).filter(([key]) => key !== SUBSCRIPTION_ID_META_KEY));
	return Object.keys(rest).length === 0 ? occurrence : {
		...occurrence,
		_meta: rest
	};
}
var PushDriver = class {
	#context;
	#loop;
	#fallback;
	#attempt = 0;
	#mismatched = false;
	#handle;
	#end;
	#grantMs;
	#dead;
	constructor(context, fallback = false) {
		this.#context = context;
		this.#loop = new DriverLoop(context, "push");
		this.#fallback = fallback;
	}
	start() {
		return this.#loop.start(() => this.#run(), { interrupt: () => this.#end?.({}) });
	}
	stop() {
		return this.#loop.stop(async () => {
			await this.#handle?.close();
		});
	}
	async #run() {
		const loop = this.#loop;
		while (!loop.ended) {
			const { error } = await this.#open();
			if (loop.ended) return;
			if (error === void 0) loop.subscribed();
			else await this.#recover(error);
			await loop.sleep(jitteredDelay(this.#attempt++));
		}
	}
	async #recover(error) {
		if (isHeaderMismatch(error) && !this.#mismatched) {
			this.#mismatched = true;
			await this.#context.connection.list(void 0, { signal: this.#loop.signal }).catch(() => {});
			return;
		}
		const { connection, subscription } = this.#context;
		const unavailable = !(error instanceof EventsError) && !endsSubscription(error) && connectionClosed(connection, error) === void 0;
		if (this.#fallback && this.#loop.first && unavailable) throw new PushUnavailableError(subscription.name, error);
		await this.#loop.recover(error);
	}
	#open() {
		const { connection, subscription } = this.#context;
		const { name, arguments: args } = subscription;
		const loop = this.#loop;
		const params = {
			name,
			...args !== void 0 && { arguments: args },
			cursor: loop.cursor,
			...loop.maxAgeMs !== void 0 && { maxAgeMs: loop.maxAgeMs }
		};
		const headers = connection.paramHeadersFor(name, args);
		this.#handle?.close();
		this.#grantMs = void 0;
		return new Promise((resolve) => {
			let ended = false;
			const end = (ending) => {
				if (ended) return;
				ended = true;
				clearTimeout(this.#dead);
				this.#end = void 0;
				resolve(ending);
			};
			this.#end = end;
			this.#dead = setTimeout(() => this.#fault(end, new SdkError(SdkErrorCode.RequestTimeout, `${EVENTS_STREAM_METHOD$1}: no valid ${EVENTS_ACTIVE_NOTIFICATION$1} in time`, { timeout: DEFAULT_REQUEST_TIMEOUT_MSEC })), DEFAULT_REQUEST_TIMEOUT_MSEC);
			try {
				this.#handle = clientInternals.openStream(connection.client, {
					method: EVENTS_STREAM_METHOD$1,
					params
				}, {
					onNotification: (notification) => {
						if (!ended) this.#frame(notification, end);
					},
					onEnd: (streamEnd) => end(endingOf(streamEnd))
				}, Object.keys(headers).length === 0 ? void 0 : { headers });
			} catch (error) {
				end({ error });
			}
		});
	}
	#frame(notification, end) {
		switch (notification.method) {
			case EVENTS_ACTIVE_NOTIFICATION$1: {
				const params = this.#parse(EventsActiveNotificationParamsSchema, notification);
				if (params === void 0) {
					this.#fault(end, new SdkError(SdkErrorCode.InvalidResult, `Invalid ${EVENTS_ACTIVE_NOTIFICATION$1} params`));
					return;
				}
				this.#active(params);
				break;
			}
			case EVENTS_EVENT_NOTIFICATION$1: {
				const params = this.#parse(EventNotificationParamsSchema, notification);
				if (params === void 0) break;
				this.#context.queue.push(withoutStreamId(params));
				this.#loop.setCursor(params.cursor ?? null);
				break;
			}
			case EVENTS_HEARTBEAT_NOTIFICATION$1: {
				const params = this.#parse(EventsHeartbeatNotificationParamsSchema, notification);
				if (params !== void 0) this.#loop.setCursor(params.cursor ?? null);
				break;
			}
			case EVENTS_TERMINATED_NOTIFICATION$1: {
				const params = this.#parse(EventsTerminatedNotificationParamsSchema, notification);
				if (params === void 0) break;
				const { code, message, data } = params.error;
				end({ error: asEventsError(ProtocolError.fromError(code, message, data)) });
				return;
			}
		}
		this.#alive(end);
	}
	#active(params) {
		const cursor = params.cursor ?? null;
		this.#grantMs = params.heartbeatMs;
		this.#attempt = 0;
		this.#mismatched = false;
		this.#loop.succeeded(cursor, params.truncated === true);
		this.#loop.setCursor(cursor);
		this.#loop.subscribed();
	}
	#alive(end) {
		if (this.#grantMs === void 0 || this.#end !== end) return;
		clearTimeout(this.#dead);
		this.#dead = setTimeout(() => this.#fault(end, void 0), Math.min(DEAD_AFTER_HEARTBEATS * this.#grantMs, MAX_TIMER_DELAY_MS));
	}
	#fault(end, error) {
		end(error === void 0 ? {} : { error });
		this.#handle?.close();
	}
	#parse(schema, notification) {
		const parsed = schema.safeParse(notification.params);
		if (parsed.success) return parsed.data;
		this.#context.connection.report(/* @__PURE__ */ new Error(`Invalid ${notification.method} params: ${parsed.error.message}`));
	}
};

//#endregion
//#region src/ext/events/receiver.ts
const MAX_BODY_BYTES = 262144;
const TIMESTAMP_TOLERANCE_SECONDS = 300;
const DEDUPE_WINDOW$1 = 1e3;
const decoder = new TextDecoder("utf-8", {
	fatal: true,
	ignoreBOM: true
});
function keyOf(secret) {
	const key = parseWebhookSecret(secret);
	if (key === void 0) throw new TypeError("Not a Standard Webhooks secret (whsec_ and base64 of 24 to 64 bytes)");
	return key;
}
function status(code, headers) {
	return new Response(null, {
		status: code,
		headers
	});
}
async function readBody(request) {
	if (request.body === null) return "";
	const reader = request.body.getReader();
	const chunks = [];
	let size = 0;
	for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
		size += chunk.value.byteLength;
		if (size > MAX_BODY_BYTES) {
			await reader.cancel();
			return;
		}
		chunks.push(chunk.value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return decoder.decode(bytes);
}
function jsonObject(text) {
	try {
		const value = JSON.parse(text);
		return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
	} catch {
		return;
	}
}
var WebhookReceiver = class {
	#pending = /* @__PURE__ */ new Set();
	#bound = /* @__PURE__ */ new Map();
	#seen = /* @__PURE__ */ new Set();
	registerPending(secret, onBind) {
		const entry = {
			key: keyOf(secret),
			onBind
		};
		this.#pending.add(entry);
		return () => void this.#pending.delete(entry);
	}
	holds(secret) {
		const key = keyOf(secret);
		const same = (other) => other.length === key.length && other.every((byte, index) => byte === key[index]);
		return [...this.#pending].some((entry) => same(entry.key)) || [...this.#bound.values()].some((entry) => same(entry.key));
	}
	bind(id, secret, sink) {
		this.#bound.set(id, {
			key: keyOf(secret),
			sink
		});
	}
	forget(id, sink) {
		if (this.#bound.get(id)?.sink === sink) this.#bound.delete(id);
	}
	async handle(request) {
		if (request.method !== "POST") return status(405, { Allow: "POST" });
		const webhookId = request.headers.get("webhook-id");
		const timestamp = request.headers.get("webhook-timestamp");
		const signature = request.headers.get("webhook-signature");
		const id = request.headers.get(WEBHOOK_SUBSCRIPTION_ID_HEADER$1);
		if (webhookId === null || timestamp === null || signature === null || id === null) return status(400);
		const seconds = /^\d+$/.test(timestamp) ? Number(timestamp) : NaN;
		if (!(Math.abs(Math.floor(Date.now() / 1e3) - seconds) <= TIMESTAMP_TOLERANCE_SECONDS)) return status(400);
		const raw = await readBody(request).catch(() => null);
		if (raw === void 0) return status(413);
		const body = raw === null ? void 0 : jsonObject(raw);
		if (raw === null || body === void 0) return status(400);
		const verifies = (key) => verifyWebhookSignature([key], webhookId, seconds, raw, signature);
		if ("type" in body && body.type === "verification") return this.#verification(id, body, verifies);
		const target = this.#bound.get(id);
		if (target?.sink === void 0) return status(503);
		if (!await verifies(target.key)) return status(401);
		if (this.#seen.has(webhookId)) return status(200);
		const route = this.#route(body, target.sink);
		if (route === void 0) return status(400);
		this.#remember(webhookId);
		route();
		return status(200);
	}
	async #verification(id, body, verifies) {
		const parsed = WebhookVerificationBodySchema.safeParse(body);
		if (!parsed.success) return status(400);
		const answer = Response.json({ challenge: parsed.data.challenge });
		const bound = this.#bound.get(id);
		if (bound !== void 0 && await verifies(bound.key)) return answer;
		for (const entry of this.#pending) {
			if (!await verifies(entry.key) || !this.#pending.delete(entry)) continue;
			this.#bound.set(id, {
				...this.#bound.get(id),
				key: entry.key
			});
			entry.onBind(id);
			return answer;
		}
		return status(401);
	}
	#route(body, sink) {
		if (!("type" in body)) {
			const occurrence = EventOccurrenceSchema.safeParse(body);
			return occurrence.success ? () => sink.event(occurrence.data) : void 0;
		}
		const control = WebhookControlBodySchema.safeParse(body);
		if (!control.success) return void 0;
		const message = control.data;
		if (message.type === "gap") return () => sink.gap(message.cursor ?? null);
		if (message.type !== "terminated") return void 0;
		const { code, message: text, data } = message.error;
		const error = ProtocolError.fromError(code, text, data);
		return () => sink.terminated(EventsError.fromProtocolError(error) ?? error);
	}
	#remember(webhookId) {
		this.#seen.add(webhookId);
		if (this.#seen.size > DEDUPE_WINDOW$1) this.#seen.delete(this.#seen.values().next().value);
	}
};

//#endregion
//#region src/ext/events/subscription.ts
const DEDUPE_WINDOW = 1e3;
var SubscriptionQueue = class {
	deliveryMode;
	#cursor;
	#deliveryStatus;
	#entries = [];
	#seen = /* @__PURE__ */ new Set();
	#waiters = [];
	#holding = false;
	#finish;
	#closed = false;
	#driver;
	#cancelled;
	constructor(deliveryMode, cursor) {
		this.deliveryMode = deliveryMode;
		this.#cursor = cursor;
	}
	get cursor() {
		return this.#cursor;
	}
	get deliveryStatus() {
		return this.#deliveryStatus;
	}
	run(driver) {
		this.#driver = driver;
		return driver.start();
	}
	push(event) {
		if (this.#done() || this.#seen.has(event.eventId)) return;
		this.#seen.add(event.eventId);
		if (this.#seen.size > DEDUPE_WINDOW) this.#seen.delete(this.#seen.values().next().value);
		const item = event;
		const waiter = this.#waiters.shift();
		if (waiter === void 0) {
			this.#entries.push({ event: item });
			return;
		}
		this.#holding = true;
		waiter.resolve({
			done: false,
			value: item
		});
	}
	setCursor(cursor) {
		if (this.#done()) return;
		if (this.#entries.length === 0 && !this.#holding) this.#cursor = cursor;
		else this.#entries.push({ cursor });
	}
	setDeliveryStatus(status$1) {
		this.#deliveryStatus = status$1;
	}
	fail(error) {
		if (this.#done()) return;
		this.#finish = { error };
		this.#settleWaiters();
	}
	end() {
		if (this.#done()) return;
		this.#finish = "end";
		this.#settleWaiters();
	}
	cancel() {
		this.#cancelled ??= (async () => {
			this.#closed = true;
			this.#entries.length = 0;
			for (const waiter of this.#waiters.splice(0)) waiter.resolve({
				done: true,
				value: void 0
			});
			await this.#driver?.stop();
		})();
		return this.#cancelled;
	}
	[Symbol.asyncIterator]() {
		return {
			next: () => this.#next(),
			return: async () => {
				await this.cancel();
				return {
					done: true,
					value: void 0
				};
			}
		};
	}
	#done() {
		return this.#closed || this.#finish !== void 0;
	}
	#next() {
		this.#holding = false;
		let entry = this.#entries.shift();
		while (entry !== void 0 && "cursor" in entry) {
			this.#cursor = entry.cursor;
			entry = this.#entries.shift();
		}
		if (entry !== void 0) {
			this.#holding = true;
			return Promise.resolve({
				done: false,
				value: entry.event
			});
		}
		if (this.#closed) return Promise.resolve({
			done: true,
			value: void 0
		});
		if (this.#finish !== void 0) return this.#deliverFinish();
		return new Promise((resolve, reject) => this.#waiters.push({
			resolve,
			reject
		}));
	}
	#settleWaiters() {
		const waiter = this.#waiters.shift();
		if (waiter === void 0) return;
		this.#deliverFinish().then(waiter.resolve, waiter.reject);
		for (const rest of this.#waiters.splice(0)) rest.resolve({
			done: true,
			value: void 0
		});
	}
	#deliverFinish() {
		const finish = this.#finish;
		this.#closed = true;
		return finish === "end" || finish === void 0 ? Promise.resolve({
			done: true,
			value: void 0
		}) : Promise.reject(finish.error);
	}
};

//#endregion
//#region src/ext/events/webhook.ts
const REFRESH_AT = .75;
var WebhookSubscriptions = class {
	#webhook;
	#receiver;
	#floorMs;
	#open = /* @__PURE__ */ new Map();
	#stopping = /* @__PURE__ */ new Map();
	constructor(webhook, receiver, floorMs) {
		this.#webhook = webhook;
		this.#receiver = receiver;
		this.#floorMs = floorMs;
	}
	driver(context) {
		const key = canonicalJson([context.subscription.name, context.subscription.arguments ?? {}]);
		let shared = this.#open.get(key);
		if (shared === void 0) {
			const after = this.#stopping.get(key) ?? Promise.resolve();
			const opened = new SharedWebhook(context, this.#webhook, this.#receiver, this.#floorMs, after, (stopping) => {
				if (this.#open.get(key) !== opened) return;
				this.#open.delete(key);
				if (stopping === void 0) return;
				this.#stopping.set(key, stopping);
				stopping.then(() => {
					if (this.#stopping.get(key) === stopping) this.#stopping.delete(key);
				});
			});
			this.#open.set(key, opened);
			shared = opened;
		}
		return shared.join(context);
	}
};
var SharedWebhook = class {
	#members = /* @__PURE__ */ new Set();
	#connection;
	#driver;
	#after;
	#close;
	#cursor;
	#deliveryStatus;
	#started;
	constructor(first, webhook, receiver, floorMs, after, close) {
		const { connection, subscription } = first;
		const members = this.#members;
		this.#connection = connection;
		this.#after = after;
		this.#close = close;
		this.#cursor = subscription.cursor ?? null;
		const queue = {
			push: (event) => {
				for (const member of members) member.queue.push(event);
			},
			setCursor: (cursor) => {
				this.#cursor = cursor;
				for (const member of members) member.queue.setCursor(cursor);
			},
			setDeliveryStatus: (status$1) => {
				this.#deliveryStatus = status$1;
				for (const member of members) member.queue.setDeliveryStatus(status$1);
			},
			fail: (error) => {
				close();
				for (const member of members) member.queue.fail(error);
			}
		};
		const onGap = (cursor) => {
			for (const member of members) reportGap(member.subscription, connection, cursor);
		};
		this.#driver = new WebhookDriver({
			subscription: {
				...subscription,
				onGap
			},
			queue,
			connection
		}, webhook, receiver, floorMs);
	}
	join(context) {
		const late = this.#members.size > 0;
		const from = this.#cursor;
		this.#members.add(context);
		return {
			start: async () => {
				this.#started ??= this.#after.then(() => this.#driver.start());
				await this.#started;
				if (!late) return;
				const own = context.subscription.cursor ?? null;
				if (own !== null && own !== from) reportGap(context.subscription, this.#connection, this.#cursor);
				context.queue.setCursor(this.#cursor);
				if (this.#deliveryStatus !== void 0) context.queue.setDeliveryStatus(this.#deliveryStatus);
			},
			stop: async () => {
				if (!this.#members.delete(context) || this.#members.size > 0) return;
				const stopping = this.#driver.stop();
				this.#close(stopping.catch(() => {}));
				await stopping;
			}
		};
	}
};
var WebhookDriver = class {
	#context;
	#loop;
	#receiver;
	#floorMs;
	#url;
	#secret;
	#mirror;
	#sink;
	#id;
	#live = false;
	#withdrawPending;
	#terminated;
	#attempt = 0;
	constructor(context, webhook, receiver, floorMs) {
		const secret = webhook.secretProvider?.() ?? generateWebhookSecret();
		if (parseWebhookSecret(secret) === void 0) throw new TypeError("webhook.secretProvider must return a Standard Webhooks secret: whsec_ and base64 of 24 to 64 bytes");
		const { name, arguments: args } = context.subscription;
		this.#context = context;
		this.#loop = new DriverLoop(context, "webhook");
		this.#receiver = receiver;
		this.#floorMs = floorMs;
		this.#url = webhook.url;
		this.#secret = secret;
		this.#mirror = {
			name,
			...args !== void 0 && { arguments: args }
		};
		this.#sink = {
			event: (occurrence) => {
				if (this.#loop.ended) return;
				context.queue.push(occurrence);
				this.#loop.setCursor(occurrence.cursor ?? null);
			},
			gap: (cursor) => {
				if (this.#loop.ended) return;
				if (cursor !== null) reportGap(context.subscription, context.connection, cursor);
				this.#loop.setCursor(cursor);
			},
			terminated: (error) => {
				if (this.#loop.ended) return;
				this.#terminated = error;
				this.#loop.wake();
			}
		};
	}
	start() {
		if (this.#receiver.holds(this.#secret)) return Promise.reject(/* @__PURE__ */ new TypeError("webhook.secretProvider must return a secret no other open subscription uses"));
		this.#withdrawPending = this.#receiver.registerPending(this.#secret, (id) => this.#bind(id));
		return this.#loop.start(() => this.#run(), { closed: () => {
			this.#live = false;
			this.#release();
		} });
	}
	stop() {
		return this.#loop.stop(async () => {
			if (this.#live) await this.#unsubscribe().catch(() => {});
			this.#release();
		});
	}
	async #run() {
		const loop = this.#loop;
		try {
			while (!loop.ended) {
				const error = await this.#subscribeAndRefresh();
				if (loop.ended) return;
				await loop.recover(error);
				await loop.sleep(retryAfterOf(error) ?? jitteredDelay(this.#attempt++));
			}
		} catch (error) {
			this.#live = false;
			this.#release();
			throw error;
		}
	}
	async #subscribeAndRefresh() {
		const loop = this.#loop;
		while (!loop.ended) {
			let result;
			try {
				result = await this.#subscribe();
			} catch (error) {
				return error;
			}
			if (loop.ended) break;
			const expiresAt = result.refreshBefore === null ? void 0 : Date.parse(result.refreshBefore);
			if (Number.isNaN(expiresAt)) return new SdkError(SdkErrorCode.InvalidResult, `Invalid refreshBefore: ${result.refreshBefore}`);
			this.#accept(result);
			if (this.#terminated === void 0) await loop.sleep(expiresAt === void 0 ? MAX_TIMER_DELAY_MS : this.#refreshDelay(expiresAt - Date.now()));
			if (this.#terminated !== void 0) {
				this.#live = false;
				return this.#terminated;
			}
		}
	}
	#refreshDelay(remainingMs) {
		const delay = Math.max(this.#floorMs, REFRESH_AT * remainingMs);
		return remainingMs > 0 && delay >= remainingMs ? REFRESH_AT * remainingMs : delay;
	}
	#subscribe() {
		const loop = this.#loop;
		const params = {
			...this.#mirror,
			delivery: {
				mode: "webhook",
				url: this.#url,
				secret: this.#secret
			},
			cursor: loop.cursor,
			...loop.maxAgeMs !== void 0 && { maxAgeMs: loop.maxAgeMs }
		};
		this.#terminated = void 0;
		return this.#context.connection.request(EVENTS_SUBSCRIBE_METHOD$1, params, SubscribeEventsResultSchema, this.#mirror, { signal: loop.signal });
	}
	#unsubscribe() {
		const params = {
			...this.#mirror,
			delivery: { url: this.#url }
		};
		return this.#context.connection.request(EVENTS_UNSUBSCRIBE_METHOD$1, params, UnsubscribeEventsResultSchema, this.#mirror);
	}
	#accept(result) {
		const loop = this.#loop;
		const cursor = result.cursor ?? null;
		this.#attempt = 0;
		this.#live = true;
		this.#bind(result.id);
		this.#withdrawPending?.();
		if (result.deliveryStatus !== void 0) this.#context.queue.setDeliveryStatus(result.deliveryStatus);
		loop.succeeded(cursor, result.truncated === true);
		loop.setCursor(cursor);
		loop.subscribed();
	}
	#bind(id) {
		this.#id = id;
		this.#receiver.bind(id, this.#secret, this.#sink);
	}
	#release() {
		this.#withdrawPending?.();
		if (this.#id !== void 0) this.#receiver.forget(this.#id, this.#sink);
		this.#id = void 0;
	}
};

//#endregion
//#region src/ext/events/extension.ts
const DEFAULT_POLL_INTERVAL_FLOOR_MS = 1e3;
const PREFERENCE = [
	"webhook",
	"push",
	"poll"
];
function selectDeliveryMode(eventName, offered, forced, webhookConfigured) {
	const usable = PREFERENCE.filter((mode$1) => (mode$1 !== "webhook" || webhookConfigured) && (forced === void 0 || mode$1 === forced));
	const mode = usable.find((candidate) => offered.includes(candidate));
	if (mode === void 0) throw new NoCompatibleDeliveryModeError(eventName, offered, usable);
	return mode;
}
/**
* Client side of the MCP Events extension (SEP-3415): lists a server's event
* types and subscribes to them. Each subscription picks a delivery mode,
* preferring webhook (when configured), then push, then poll, and runs it,
* deduplicating by `eventId` and tracking the cursor. Events is used only on
* protocol revision `2026-07-28` and later. Pass it in one client's
* `extensions` option.
*
* @example
* ```ts
* const events = new EventsClientExtension();
* const client = new Client({ name: 'ops-console', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' }, extensions: [events] });
* await client.connect(transport);
* const subscription = await events.subscribe({ name: 'incident.created', arguments: { severity: 'P1' } });
* for await (const event of subscription) {
*     console.log(event.data);
* }
* ```
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
var EventsClientExtension = class {
	/** The extension identifier the client declares. */
	id = EVENTS_EXTENSION_ID$1;
	#options;
	#floorMs;
	#receiver = new WebhookReceiver();
	#webhooks;
	#connection;
	/** @throws {TypeError} when `pollIntervalFloorMs` is not a positive finite number. */
	constructor(options = {}) {
		const floorMs = options.pollIntervalFloorMs ?? DEFAULT_POLL_INTERVAL_FLOOR_MS;
		if (!(Number.isFinite(floorMs) && floorMs > 0)) throw new TypeError(`pollIntervalFloorMs must be a positive finite number (got ${String(floorMs)})`);
		this.#options = options;
		this.#floorMs = floorMs;
		this.#webhooks = options.webhook === void 0 ? void 0 : new WebhookSubscriptions(options.webhook, this.#receiver, floorMs);
	}
	/**
	* Binds this instance to the client that lists it in `extensions`: the
	* client calls it once, while it is constructed, and declares the
	* extension as `{}`. One client per instance.
	*
	* @throws {Error} when another client already holds this instance, which fails the new client's constructor.
	*/
	setup(ctx) {
		if (this.#connection !== void 0) throw new Error("This EventsClientExtension is already in another client; pass a new one in each client's extensions option");
		this.#connection = new EventsConnection(ctx.client);
	}
	/** The server advertised the extension and the connection is on protocol `2026-07-28` or later. `false` before connect. */
	get supported() {
		const client = this.#connection?.client;
		return client !== void 0 && client.getProtocolEra() === "modern" && eventsCapabilityOf(client.getServerCapabilities()) !== void 0;
	}
	/**
	* Lists the server's event types, walking every page unless given a
	* cursor. Event types whose `x-mcp-header` annotations are invalid are
	* left out, with a warning.
	*
	* @throws {EventsError} when the server refuses the request.
	* @throws {SdkError} `CapabilityNotSupported` when {@linkcode EventsClientExtension.supported} is `false`.
	*/
	async list(params = {}) {
		return this.#require(EVENTS_LIST_METHOD$1).list(params.cursor);
	}
	/**
	* Subscribes to an event type, looking its descriptor up in the last
	* `events/list` (fetched again when it is not there), and resolves once
	* the first exchange with the server succeeds (for poll, the first
	* `events/poll` response; for push, the first
	* `notifications/events/active`, within the request timeout; for webhook,
	* the `events/subscribe` response). A transient failure of that exchange (a
	* transport error, an HTTP `5xx` or `429`, a JSON-RPC error other than an
	* Events kind and `-32601`, or the server's webhook verification limit,
	* `resourceExhausted` with `data.limit: 'verification'`, retried after its
	* `data.retryAfterMs` when given) does not reject: it is reported to the
	* client's `onerror`, and delivery is retried in the background. Without
	* `delivery`, a push subscription whose first stream fails before its
	* first `active` with anything but an `EventsError`, an auth failure or a
	* `-32601` (no valid `active` within the request timeout, as behind a host
	* that buffers whole responses, a transport error, or an `active` that
	* fails its schema) reports that failure to the client's `onerror` and
	* subscribes by poll instead, once, when the event type offers poll. An
	* auth failure of the transport (such as the `UnauthorizedError` of a
	* `401` its `authProvider` could not resolve) rejects, and so does a
	* `-32601`. When the server refuses the selected delivery mode
	* (`unsupported` with `data.feature: 'deliveryMode'`), the event types are
	* listed again once and the mode selected again from that listing; a
	* `delivery` the server refuses is not changed to another mode. A `cursor`
	* the server refuses because the event type's schema changed is dropped:
	* the event types are listed again, the subscription starts from now, and
	* `onGap` reports the fresh cursor. A `-32020` lists the event types again
	* and retries once. Once subscribed, every mode recovers from errors as
	* {@linkcode EventSubscription} describes.
	*
	* Webhook subscriptions with the same name and arguments are one server
	* subscription. A later one joins the open one rather than sending
	* `events/subscribe` (its `cursor` and `maxAgeMs` are not sent; `onGap`
	* reports a `cursor` of its own that is not where the shared one is) and
	* settles as that one's first exchange does. Each gets every event in its
	* own loop, an end of the shared one ends them all, and
	* `events/unsubscribe` goes out when the last of them is cancelled.
	*
	* @throws {EventsError} when the server refuses the subscription: `notFound` for an event type it does not list or
	*   no longer serves, `invalidParams` for arguments its `inputSchema` rejects, `forbidden`, or another kind
	*   (`resourceExhausted` for any limit but the webhook verification limit, `unsupported` for a delivery mode it
	*   still refuses after the re-list).
	* @throws {NoCompatibleDeliveryModeError} when no delivery mode the event type offers is usable here, also when
	*   the schema change that refused `cursor`, or the re-list after a refused delivery mode, left the event type
	*   without a usable mode.
	* @throws {SdkError} `CapabilityNotSupported` when {@linkcode EventsClientExtension.supported} is `false`,
	*   `ConnectionClosed` when the client closes before the first exchange answers, or another code when that
	*   exchange fails in the SDK (for example `RequestTimeout`, also when a push stream that does not fall back to
	*   poll sends no valid `notifications/events/active` in time, `InvalidResult` for an `active` that fails its
	*   schema, or an `SdkHttpError` for an HTTP error status other than `5xx` and `429`).
	* @throws {ProtocolError} `-32020` when the server rejects the `Mcp-Param` headers again after a re-list, or
	*   `-32601` when it does not serve the method.
	* @throws {Error} the transport's auth failure (such as `UnauthorizedError`) when the first exchange is not
	*   authorized.
	* @throws {TypeError} when `webhook.secretProvider` returns something that is not a Standard Webhooks secret, or a
	*   secret another open server subscription signs with.
	*/
	async subscribe(options) {
		const connection = this.#require("subscribe");
		let descriptor = connection.descriptor(options.name);
		if (descriptor === void 0) {
			await connection.list();
			descriptor = connection.descriptor(options.name);
		}
		if (descriptor === void 0) throw new EventsError("notFound", "Event type not found", { kind: "event" });
		const mode = this.#select(options, descriptor);
		try {
			return await this.#subscribeIn(mode, descriptor, options, connection);
		} catch (error) {
			if (!isModeRefusal(error)) throw error;
			let fresh;
			try {
				await connection.list();
				fresh = connection.descriptor(options.name);
			} catch {
				throw error;
			}
			if (fresh === void 0) throw error;
			const again = this.#select(options, fresh);
			if (again === mode) throw error;
			return this.#subscribeIn(again, fresh, options, connection);
		}
	}
	/**
	* The receiver for webhook delivery, a `(request: Request) => Promise<Response>`
	* to mount at `webhook.url` in any fetch-style server; every handler it
	* returns serves this instance's subscriptions. It verifies each POST's
	* Standard Webhooks signature over the raw body, answers the server's
	* verification challenge, delivers each `webhook-id` once within the last
	* 1 000 ids it delivered, and routes events and `gap` and `terminated`
	* bodies into their subscription.
	* Answers: `405` to anything but POST, `413` to a body over 256 KiB,
	* `400` to a missing header, a timestamp more than 5 minutes off or a
	* malformed body, `401` to a bad signature, and `503` to a subscription
	* id it does not route (yet), which the server retries.
	*/
	createWebhookHandler() {
		const receiver = this.#receiver;
		return (request) => receiver.handle(request);
	}
	#select(options, descriptor) {
		return selectDeliveryMode(options.name, descriptor.delivery, options.delivery, this.#options.webhook !== void 0);
	}
	async #subscribeIn(mode, descriptor, options, connection) {
		const fallback = options.delivery === void 0 && mode === "push" && descriptor.delivery.includes("poll");
		try {
			return await this.#start(mode, options, connection, fallback);
		} catch (error) {
			if (!(error instanceof PushUnavailableError)) throw error;
			connection.report(error);
			return this.#start("poll", options, connection, false);
		}
	}
	async #start(mode, options, connection, fallback) {
		const queue = new SubscriptionQueue(mode, options.cursor ?? null);
		try {
			await queue.run(this.#driver(mode, {
				subscription: { ...options },
				queue,
				connection
			}, fallback));
		} catch (error) {
			await queue.cancel();
			throw error;
		}
		return queue;
	}
	#driver(mode, context, fallback) {
		if (mode === "poll") return new PollDriver(context, this.#floorMs);
		if (mode === "push") return new PushDriver(context, fallback);
		return this.#webhooks.driver(context);
	}
	#require(method) {
		const connection = this.#connection;
		if (connection === void 0) throw new Error(`No client was constructed with this EventsClientExtension; pass it in the client's extensions option before ${method}`);
		if (!this.supported) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support the ${EVENTS_EXTENSION_ID$1} extension (required for ${method})`);
		return connection;
	}
};

//#endregion
export { DELIVERY_ERROR_CATEGORIES, DELIVERY_MODES, EVENTS_ACTIVE_NOTIFICATION, EVENTS_ERROR_NOTIFICATION, EVENTS_EVENT_NOTIFICATION, EVENTS_EXTENSION_ID, EVENTS_HEARTBEAT_NOTIFICATION, EVENTS_LIST_METHOD, EVENTS_POLL_METHOD, EVENTS_STREAM_METHOD, EVENTS_SUBSCRIBE_METHOD, EVENTS_TERMINATED_NOTIFICATION, EVENTS_UNSUBSCRIBE_METHOD, EventsClientExtension, EventsError, NoCompatibleDeliveryModeError, WEBHOOK_SUBSCRIPTION_ID_HEADER };
