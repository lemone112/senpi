import { Ft as PaginatedRequestParamsSchema, Lt as PaginatedResultSchema, fn as ResultSchema, i as BaseRequestParamsSchema } from "../../schemas.mjs";
import * as z from "zod/v4";

//#region src/ext/events/constants.ts
/**
* Wire constants for the MCP Events extension (SEP-3415).
*
* Runtime-neutral: this module imports nothing.
*/
/**
* The identifier a server advertises in `ServerCapabilities.extensions`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EVENTS_EXTENSION_ID = "io.modelcontextprotocol/events";
/**
* Lists the event types a server offers.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EVENTS_LIST_METHOD = "events/list";
/**
* Fetches the events of one subscription since a cursor (poll delivery).
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EVENTS_POLL_METHOD = "events/poll";
/**
* Opens a long-lived stream for one subscription (push delivery).
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EVENTS_STREAM_METHOD = "events/stream";
/**
* Creates or refreshes a webhook subscription (webhook delivery).
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EVENTS_SUBSCRIBE_METHOD = "events/subscribe";
/**
* Removes a webhook subscription.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EVENTS_UNSUBSCRIBE_METHOD = "events/unsubscribe";
/**
* Confirms a push stream, carrying the granted heartbeat interval; sent again mid-stream after a gap.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EVENTS_ACTIVE_NOTIFICATION = "notifications/events/active";
/**
* Delivers one event occurrence on a push stream.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EVENTS_EVENT_NOTIFICATION = "notifications/events/event";
/**
* Keeps a push stream alive and advances its cursor while no events match.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EVENTS_HEARTBEAT_NOTIFICATION = "notifications/events/heartbeat";
/**
* Reports a recoverable failure on a push stream, which stays open.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EVENTS_ERROR_NOTIFICATION = "notifications/events/error";
/**
* Ends a push subscription from the server side.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EVENTS_TERMINATED_NOTIFICATION = "notifications/events/terminated";
/**
* The header carrying the subscription `id` on every webhook POST.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const WEBHOOK_SUBSCRIPTION_ID_HEADER = "X-MCP-Subscription-Id";
/**
* The delivery modes an event type can advertise.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const DELIVERY_MODES = [
	"poll",
	"push",
	"webhook"
];
/**
* The categories a server reports as `deliveryStatus.lastError`, and as `data.reason` of a callback endpoint error.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const DELIVERY_ERROR_CATEGORIES = [
	"connection_refused",
	"timeout",
	"tls_error",
	"http_4xx",
	"http_5xx",
	"challenge_failed"
];

//#endregion
//#region src/ext/events/schemas.ts
const cursor = z.string().nullable().optional();
const meta = z.record(z.string(), z.unknown()).optional();
const jsonObject = z.record(z.string(), z.unknown());
/**
* One of `poll`, `push`, `webhook`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const DeliveryModeSchema = z.enum(DELIVERY_MODES);
/**
* One of the six webhook delivery failure categories.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const DeliveryErrorCategorySchema = z.enum(DELIVERY_ERROR_CATEGORIES);
/**
* An event type as `events/list` describes it.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EventDescriptorSchema = z.looseObject({
	name: z.string(),
	description: z.string().optional(),
	delivery: z.array(DeliveryModeSchema).min(1),
	inputSchema: jsonObject,
	payloadSchema: jsonObject,
	_meta: meta
});
/**
* One delivered event: a poll result entry, the params of `notifications/events/event`, or a webhook event body.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EventOccurrenceSchema = z.looseObject({
	eventId: z.string(),
	name: z.string(),
	timestamp: z.string(),
	data: jsonObject,
	cursor,
	_meta: meta
});
/**
* The error object of `notifications/events/error`, `notifications/events/terminated` and the webhook `terminated` body.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EventsErrorObjectSchema = z.looseObject({
	code: z.number().int(),
	message: z.string(),
	data: jsonObject.optional()
});
/**
* Params of `events/list`: the pagination params every list request takes.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const ListEventsRequestParamsSchema = PaginatedRequestParamsSchema;
/**
* Result of `events/list`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const ListEventsResultSchema = z.looseObject({
	...PaginatedResultSchema.shape,
	events: z.array(EventDescriptorSchema)
});
const subscriptionRequestFields = {
	...BaseRequestParamsSchema.shape,
	name: z.string(),
	arguments: jsonObject.optional(),
	cursor,
	maxAgeMs: z.number().int().nonnegative().optional()
};
/**
* Params of `events/poll`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const PollEventsRequestParamsSchema = z.looseObject({
	...subscriptionRequestFields,
	maxEvents: z.number().int().min(1).optional()
});
/**
* Result of `events/poll`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const PollEventsResultSchema = z.looseObject({
	...ResultSchema.shape,
	events: z.array(EventOccurrenceSchema),
	cursor,
	truncated: z.boolean().optional(),
	hasMore: z.boolean().optional(),
	nextPollMs: z.number().int().nonnegative().optional()
});
/**
* Params of `events/stream`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const StreamEventsRequestParamsSchema = z.looseObject({
	...subscriptionRequestFields,
	heartbeatMs: z.number().int().min(1).optional()
});
/**
* Result of `events/stream`: the empty final frame when the server closes the stream.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const StreamEventsResultSchema = z.looseObject(ResultSchema.shape);
/**
* The `delivery` object of `events/subscribe`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const WebhookDeliverySchema = z.looseObject({
	mode: z.literal("webhook"),
	url: z.string(),
	secret: z.string()
});
/**
* The `delivery` object of `events/unsubscribe`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const WebhookTargetSchema = z.looseObject({ url: z.string() });
/**
* Params of `events/subscribe`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const SubscribeEventsRequestParamsSchema = z.looseObject({
	...subscriptionRequestFields,
	delivery: WebhookDeliverySchema,
	ttlMs: z.number().int().nonnegative().nullable().optional()
});
/**
* Webhook delivery health, as an `events/subscribe` refresh may report it.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const DeliveryStatusSchema = z.looseObject({
	active: z.boolean(),
	lastDeliveryAt: z.string().nullable().optional(),
	lastError: DeliveryErrorCategorySchema.nullable().optional(),
	failedSince: z.string().optional(),
	throttled: z.boolean().optional(),
	retryAfterMs: z.number().int().nonnegative().optional()
});
/**
* Result of `events/subscribe`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const SubscribeEventsResultSchema = z.looseObject({
	...ResultSchema.shape,
	id: z.string(),
	refreshBefore: z.string().nullable(),
	cursor,
	truncated: z.boolean().optional(),
	deliveryStatus: DeliveryStatusSchema.optional()
});
/**
* Params of `events/unsubscribe`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const UnsubscribeEventsRequestParamsSchema = z.looseObject({
	...BaseRequestParamsSchema.shape,
	name: z.string(),
	arguments: jsonObject.optional(),
	delivery: WebhookTargetSchema
});
/**
* Result of `events/unsubscribe`: an empty result.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const UnsubscribeEventsResultSchema = z.looseObject(ResultSchema.shape);
/**
* Params of `notifications/events/active`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EventsActiveNotificationParamsSchema = z.looseObject({
	cursor,
	truncated: z.boolean().optional(),
	heartbeatMs: z.number().int().min(1),
	_meta: meta
});
/**
* Params of `notifications/events/event`: one event occurrence.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EventNotificationParamsSchema = EventOccurrenceSchema;
/**
* Params of `notifications/events/heartbeat`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EventsHeartbeatNotificationParamsSchema = z.looseObject({
	cursor,
	_meta: meta
});
const errorNotificationFields = {
	error: EventsErrorObjectSchema,
	_meta: meta
};
/**
* Params of `notifications/events/error`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EventsErrorNotificationParamsSchema = z.looseObject(errorNotificationFields);
/**
* Params of `notifications/events/terminated`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EventsTerminatedNotificationParamsSchema = z.looseObject(errorNotificationFields);
/**
* Webhook control body: a gap between refreshes, with the fresh cursor to persist.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const WebhookGapBodySchema = z.looseObject({
	type: z.literal("gap"),
	cursor
});
/**
* Webhook control body: the subscription has ended.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const WebhookTerminatedBodySchema = z.looseObject({
	type: z.literal("terminated"),
	error: EventsErrorObjectSchema
});
/**
* Webhook control body: the endpoint verification challenge, echoed back in a `2xx` body.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const WebhookVerificationBodySchema = z.looseObject({
	type: z.literal("verification"),
	challenge: z.string()
});
/**
* Any webhook control body; a webhook body without a top-level `type` is an event occurrence.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const WebhookControlBodySchema = z.discriminatedUnion("type", [
	WebhookGapBodySchema,
	WebhookTerminatedBodySchema,
	WebhookVerificationBodySchema
]);
/**
* The value at `capabilities.extensions["io.modelcontextprotocol/events"]`.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
const EventsCapabilitySchema = z.looseObject({ listChanged: z.boolean().optional() });

//#endregion
//#region src/ext/events/capability.ts
/**
* Reads the Events extension capability out of a peer's advertised
* capabilities, returning `undefined` when the peer does not advertise the
* extension or advertises a malformed value.
*
* Experimental: Events (SEP-3415) is new; this API may change in a minor release.
*
* @experimental
*/
function eventsCapabilityOf(capabilities) {
	const declared = capabilities?.extensions?.[EVENTS_EXTENSION_ID];
	if (declared === void 0) return;
	const parsed = EventsCapabilitySchema.safeParse(declared);
	return parsed.success ? parsed.data : void 0;
}

//#endregion
export { DELIVERY_ERROR_CATEGORIES, DELIVERY_MODES, DeliveryErrorCategorySchema, DeliveryModeSchema, DeliveryStatusSchema, EVENTS_ACTIVE_NOTIFICATION, EVENTS_ERROR_NOTIFICATION, EVENTS_EVENT_NOTIFICATION, EVENTS_EXTENSION_ID, EVENTS_HEARTBEAT_NOTIFICATION, EVENTS_LIST_METHOD, EVENTS_POLL_METHOD, EVENTS_STREAM_METHOD, EVENTS_SUBSCRIBE_METHOD, EVENTS_TERMINATED_NOTIFICATION, EVENTS_UNSUBSCRIBE_METHOD, EventDescriptorSchema, EventNotificationParamsSchema, EventOccurrenceSchema, EventsActiveNotificationParamsSchema, EventsCapabilitySchema, EventsErrorNotificationParamsSchema, EventsErrorObjectSchema, EventsHeartbeatNotificationParamsSchema, EventsTerminatedNotificationParamsSchema, ListEventsRequestParamsSchema, ListEventsResultSchema, PollEventsRequestParamsSchema, PollEventsResultSchema, StreamEventsRequestParamsSchema, StreamEventsResultSchema, SubscribeEventsRequestParamsSchema, SubscribeEventsResultSchema, UnsubscribeEventsRequestParamsSchema, UnsubscribeEventsResultSchema, WEBHOOK_SUBSCRIPTION_ID_HEADER, WebhookControlBodySchema, WebhookDeliverySchema, WebhookGapBodySchema, WebhookTargetSchema, WebhookTerminatedBodySchema, WebhookVerificationBodySchema, eventsCapabilityOf };
