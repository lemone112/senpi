import { aa as SdkError, et as ProtocolError } from "../../index2.mjs";
import { n as ClientExtensionContext, t as ClientExtension } from "../../extension.mjs";
import { DELIVERY_ERROR_CATEGORIES, DELIVERY_MODES, DeliveryErrorCategory, DeliveryMode, DeliveryMode as DeliveryMode$1, DeliveryStatus, DeliveryStatus as DeliveryStatus$1, EVENTS_ACTIVE_NOTIFICATION, EVENTS_ERROR_NOTIFICATION, EVENTS_EVENT_NOTIFICATION, EVENTS_EXTENSION_ID, EVENTS_HEARTBEAT_NOTIFICATION, EVENTS_LIST_METHOD, EVENTS_POLL_METHOD, EVENTS_STREAM_METHOD, EVENTS_SUBSCRIBE_METHOD, EVENTS_TERMINATED_NOTIFICATION, EVENTS_UNSUBSCRIBE_METHOD, EventDescriptor, EventNotificationParams, EventOccurrence, EventOccurrence as EventOccurrence$1, EventsActiveNotificationParams, EventsCapability, EventsErrorNotificationParams, EventsErrorObject, EventsHeartbeatNotificationParams, EventsTerminatedNotificationParams, ListEventsRequestParams, ListEventsResult, ListEventsResult as ListEventsResult$1, PollEventsRequestParams, PollEventsResult, StreamEventsRequestParams, StreamEventsResult, SubscribeEventsRequestParams, SubscribeEventsResult, UnsubscribeEventsRequestParams, UnsubscribeEventsResult, WEBHOOK_SUBSCRIPTION_ID_HEADER, WebhookControlBody, WebhookDelivery, WebhookGapBody, WebhookTarget, WebhookTerminatedBody, WebhookVerificationBody } from "../../../core/ext/events/index.mjs";

//#region src/ext/events/errors.d.ts

/**
 * No delivery mode the event type offers is usable by this client: webhook
 * needs the `webhook` option, and a forced `delivery` narrows the client to
 * that one mode.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare class NoCompatibleDeliveryModeError extends SdkError {
  readonly eventName: string;
  /** The modes the event type's descriptor lists. */
  readonly offered: readonly DeliveryMode$1[];
  /** The modes this client could use for the request. */
  readonly usable: readonly DeliveryMode$1[];
  constructor(eventName: string, offered: readonly DeliveryMode$1[], usable: readonly DeliveryMode$1[]);
}
//#endregion
//#region src/ext/events/subscription.d.ts
/**
 * What to subscribe to, and how.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
interface SubscribeOptions {
  /** The event type, as `events/list` names it. */
  name: string;
  /** Subscription arguments, valid against the event type's `inputSchema`. */
  arguments?: Record<string, unknown>;
  /** Forces one delivery mode instead of the default preference (webhook, then push, then poll) and the fallback from push to poll. */
  delivery?: DeliveryMode$1;
  /** Resumes from a persisted {@linkcode EventSubscription.cursor}; `null` or absent starts from now. */
  cursor?: string | null;
  /** Replays no event older than this many milliseconds, however old `cursor` is. */
  maxAgeMs?: number;
  /**
   * Called with the fresh cursor when events may have been skipped: the
   * server reports `truncated`, or delivery started again from now after a
   * schema change. An error it throws goes to the client's `onerror`, and
   * delivery goes on.
   */
  onGap?: (cursor: string | null) => void;
}
/**
 * One subscription's events. The `for await` loop, and how a subscription
 * recovers from errors, are the same in every delivery mode. A refusal of the
 * subscription itself comes from `subscribe()`. Once subscribed, a server
 * error (an error response, a push `terminated` frame or a webhook
 * `terminated` body) is handled by its kind:
 *
 * - `notFound`, or `unsupported` for a schema change: the event types are
 *   listed again, and delivery goes on while the event type is still listed
 *   with this delivery mode; otherwise the loop ends with that `EventsError`.
 *   After a schema change delivery resumes from the last cursor; when the
 *   server refuses that cursor too, it starts again from now and `onGap`
 *   reports it.
 * - Any other `EventsError` (`forbidden`, `invalidParams`, `resourceExhausted`
 *   other than the webhook verification limit, `callbackEndpointError`, any
 *   other `unsupported`): the loop ends with it, and `kind` says why.
 * - A `ProtocolError` `-32020` (the `Mcp-Param` headers do not match the
 *   arguments): the event types are listed again and the request is retried
 *   once with fresh headers; a second `-32020` ends the loop with it.
 * - An auth failure of the transport (such as the `UnauthorizedError` of a
 *   `401` its `authProvider` could not resolve), or a `ProtocolError`
 *   `-32601` (the server no longer serves the method): the loop ends with it.
 * - Anything else (a network or transport failure, an HTTP error status,
 *   another JSON-RPC error, a push stream that ends, goes silent or sends no
 *   valid `active`): retried after a backoff. The server's webhook
 *   verification limit (`resourceExhausted` with `data.limit:
 *   'verification'`) is retried after its `data.retryAfterMs`, or after a
 *   backoff without one. Each of these failures but a push stream that ends
 *   or goes silent is reported to the client's `onerror`: the first at once,
 *   then at most one report a minute with how many were retried since.
 *
 * Closing the client, or connecting it again without resuming its session,
 * ends its subscriptions at once: the loop rejects with an `SdkError`
 * (`ConnectionClosed`), and a webhook subscription is left to lapse on the
 * server. After reconnecting, subscribe again and pass
 * {@linkcode EventSubscription.cursor}.
 * `T` types `data` and is not checked against the event type's
 * `payloadSchema`. Leaving the loop early cancels the subscription.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
interface EventSubscription<T = Record<string, unknown>> extends AsyncIterable<EventOccurrence$1 & {
  data: T;
}> {
  /**
   * The newest cursor that is safe to persist: it covers every event the
   * loop has finished with (an event is finished when the loop asks for the
   * next one). `null` for event types that do not support replay.
   */
  readonly cursor: string | null;
  readonly deliveryMode: DeliveryMode$1;
  /** Webhook delivery health, as the server last reported it in an `events/subscribe` result. */
  readonly deliveryStatus?: DeliveryStatus$1;
  /**
   * Stops delivery and ends the loop. Cancelling the last of identical
   * webhook subscriptions also removes the subscription on the server
   * (`events/unsubscribe`).
   */
  cancel(): Promise<void>;
}
//#endregion
//#region src/ext/events/extension.d.ts
/**
 * Options for {@linkcode EventsClientExtension}.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
interface EventsClientOptions {
  /**
   * Webhook delivery: the callback URL the server POSTs events to, where
   * {@linkcode EventsClientExtension.createWebhookHandler} is mounted. Each
   * server subscription signs with its own `whsec_` secret, random unless
   * `secretProvider` supplies it. `subscribe()` rejects with `TypeError`
   * when the value is not a Standard Webhooks secret (`whsec_` and base64
   * of 24 to 64 bytes), or when another open server subscription already
   * signs with it, since the receiver could not tell their verification
   * challenges apart: return a distinct secret each call. With it set, a
   * subscription prefers webhook where the event type offers it.
   */
  webhook?: {
    url: string;
    secretProvider?: () => string;
  };
  /**
   * The shortest wait between two polls, whatever `nextPollMs` the server
   * recommends, and between two webhook refreshes, whatever the grant
   * (a skewed clock cannot make them back to back), unless it would reach
   * the end of the grant: the refresh then comes at ¾ of it. Default 1000.
   */
  pollIntervalFloorMs?: number;
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
declare class EventsClientExtension implements ClientExtension {
  #private;
  /** The extension identifier the client declares. */
  readonly id = "io.modelcontextprotocol/events";
  /** @throws {TypeError} when `pollIntervalFloorMs` is not a positive finite number. */
  constructor(options?: EventsClientOptions);
  /**
   * Binds this instance to the client that lists it in `extensions`: the
   * client calls it once, while it is constructed, and declares the
   * extension as `{}`. One client per instance.
   *
   * @throws {Error} when another client already holds this instance, which fails the new client's constructor.
   */
  setup(ctx: ClientExtensionContext): void;
  /** The server advertised the extension and the connection is on protocol `2026-07-28` or later. `false` before connect. */
  get supported(): boolean;
  /**
   * Lists the server's event types, walking every page unless given a
   * cursor. Event types whose `x-mcp-header` annotations are invalid are
   * left out, with a warning.
   *
   * @throws {EventsError} when the server refuses the request.
   * @throws {SdkError} `CapabilityNotSupported` when {@linkcode EventsClientExtension.supported} is `false`.
   */
  list(params?: {
    cursor?: string;
  }): Promise<ListEventsResult$1>;
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
  subscribe<T = Record<string, unknown>>(options: SubscribeOptions): Promise<EventSubscription<T>>;
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
  createWebhookHandler(): (request: Request) => Promise<Response>;
}
//#endregion
//#region ../core-internal/src/ext/events/codes.d.ts
/**
 * What went wrong in an Events (SEP-3415) request or subscription: the SEP's error vocabulary.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type EventsErrorKind = 'invalidParams' | 'notFound' | 'forbidden' | 'resourceExhausted' | 'unsupported' | 'callbackEndpointError';
//#endregion
//#region ../core-internal/src/ext/events/errors.d.ts
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
declare class EventsError extends ProtocolError {
  constructor(kind: EventsErrorKind, message: string, data?: Record<string, unknown>);
  /** What went wrong. */
  get kind(): EventsErrorKind;
  /**
   * The `EventsError` for a `ProtocolError` received from an `events/*` request, by its code;
   * `undefined` for a code outside the Events error table. Data that is not an object is dropped.
   */
  static fromProtocolError(error: ProtocolError): EventsError | undefined;
}
//#endregion
export { DELIVERY_ERROR_CATEGORIES, DELIVERY_MODES, type DeliveryErrorCategory, type DeliveryMode, type DeliveryStatus, EVENTS_ACTIVE_NOTIFICATION, EVENTS_ERROR_NOTIFICATION, EVENTS_EVENT_NOTIFICATION, EVENTS_EXTENSION_ID, EVENTS_HEARTBEAT_NOTIFICATION, EVENTS_LIST_METHOD, EVENTS_POLL_METHOD, EVENTS_STREAM_METHOD, EVENTS_SUBSCRIBE_METHOD, EVENTS_TERMINATED_NOTIFICATION, EVENTS_UNSUBSCRIBE_METHOD, type EventDescriptor, type EventNotificationParams, type EventOccurrence, type EventSubscription, type EventsActiveNotificationParams, type EventsCapability, EventsClientExtension, type EventsClientOptions, EventsError, type EventsErrorKind, type EventsErrorNotificationParams, type EventsErrorObject, type EventsHeartbeatNotificationParams, type EventsTerminatedNotificationParams, type ListEventsRequestParams, type ListEventsResult, NoCompatibleDeliveryModeError, type PollEventsRequestParams, type PollEventsResult, type StreamEventsRequestParams, type StreamEventsResult, type SubscribeEventsRequestParams, type SubscribeEventsResult, type SubscribeOptions, type UnsubscribeEventsRequestParams, type UnsubscribeEventsResult, WEBHOOK_SUBSCRIPTION_ID_HEADER, type WebhookControlBody, type WebhookDelivery, type WebhookGapBody, type WebhookTarget, type WebhookTerminatedBody, type WebhookVerificationBody };
