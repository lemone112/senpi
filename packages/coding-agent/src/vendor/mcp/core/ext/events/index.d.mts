import "../../schemas.mjs";
import { t as CapabilitiesWithExtensions } from "../../capability.mjs";
import * as z from "zod/v4";

//#region src/ext/events/schemas.d.ts

/**
 * One of `poll`, `push`, `webhook`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const DeliveryModeSchema: z.ZodEnum<{
  poll: "poll";
  push: "push";
  webhook: "webhook";
}>;
/**
 * One of the six webhook delivery failure categories.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const DeliveryErrorCategorySchema: z.ZodEnum<{
  challenge_failed: "challenge_failed";
  connection_refused: "connection_refused";
  http_4xx: "http_4xx";
  http_5xx: "http_5xx";
  timeout: "timeout";
  tls_error: "tls_error";
}>;
/**
 * An event type as `events/list` describes it.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EventDescriptorSchema: z.ZodObject<{
  name: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  /** The delivery modes the event type supports; never empty. */
  delivery: z.ZodArray<z.ZodEnum<{
    poll: "poll";
    push: "push";
    webhook: "webhook";
  }>>;
  /** JSON Schema for the subscription `arguments`. */
  inputSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
  /** JSON Schema for `data` in delivered events. */
  payloadSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
  _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$loose>;
/**
 * One delivered event: a poll result entry, the params of `notifications/events/event`, or a webhook event body.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EventOccurrenceSchema: z.ZodObject<{
  /** Stable identifier of the upstream event, for deduplication within a subscription. */
  eventId: z.ZodString;
  name: z.ZodString;
  /** ISO 8601 time the event occurred. */
  timestamp: z.ZodString;
  /** Payload conforming to the event type's `payloadSchema`. */
  data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
  /** Subscription position after this event (push and webhook); `null` without replay. */
  cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$loose>;
/**
 * The error object of `notifications/events/error`, `notifications/events/terminated` and the webhook `terminated` body.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EventsErrorObjectSchema: z.ZodObject<{
  code: z.ZodNumber;
  message: z.ZodString;
  data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$loose>;
/**
 * Params of `events/list`: the pagination params every list request takes.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const ListEventsRequestParamsSchema: z.ZodObject<{
  _meta: z.ZodOptional<z.ZodObject<{
    progressToken: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    "io.modelcontextprotocol/related-task": z.ZodOptional<z.ZodObject<{
      taskId: z.ZodString;
    }, z.core.$strip>>;
  }, z.core.$loose>>;
  cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * Result of `events/list`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const ListEventsResultSchema: z.ZodObject<{
  events: z.ZodArray<z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    /** The delivery modes the event type supports; never empty. */
    delivery: z.ZodArray<z.ZodEnum<{
      poll: "poll";
      push: "push";
      webhook: "webhook";
    }>>;
    /** JSON Schema for the subscription `arguments`. */
    inputSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    /** JSON Schema for `data` in delivered events. */
    payloadSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }, z.core.$loose>>;
  _meta: z.ZodOptional<z.ZodObject<{
    readonly "io.modelcontextprotocol/serverInfo": z.ZodCatch<z.ZodOptional<z.ZodObject<{
      version: z.ZodString;
      websiteUrl: z.ZodOptional<z.ZodString>;
      description: z.ZodOptional<z.ZodString>;
      icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        theme: z.ZodOptional<z.ZodEnum<{
          dark: "dark";
          light: "light";
        }>>;
      }, z.core.$strip>>>;
      name: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
  }, z.core.$loose>>;
  nextCursor: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
/**
 * Params of `events/poll`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const PollEventsRequestParamsSchema: z.ZodObject<{
  /** Cap on the number of events returned. */
  maxEvents: z.ZodOptional<z.ZodNumber>;
  /** The event type name. */
  name: z.ZodString;
  /** Subscription arguments, valid against the event type's `inputSchema`. */
  arguments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  /** Where to start: `null` (or absent) means now. */
  cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  /** Do not replay events older than this many milliseconds. */
  maxAgeMs: z.ZodOptional<z.ZodNumber>;
  _meta: z.ZodOptional<z.ZodObject<{
    progressToken: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    "io.modelcontextprotocol/related-task": z.ZodOptional<z.ZodObject<{
      taskId: z.ZodString;
    }, z.core.$strip>>;
  }, z.core.$loose>>;
}, z.core.$loose>;
/**
 * Result of `events/poll`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const PollEventsResultSchema: z.ZodObject<{
  events: z.ZodArray<z.ZodObject<{
    /** Stable identifier of the upstream event, for deduplication within a subscription. */
    eventId: z.ZodString;
    name: z.ZodString;
    /** ISO 8601 time the event occurred. */
    timestamp: z.ZodString;
    /** Payload conforming to the event type's `payloadSchema`. */
    data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    /** Subscription position after this event (push and webhook); `null` without replay. */
    cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }, z.core.$loose>>;
  /** The position to poll from next; `null` without replay. */
  cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  /** Whether events were skipped between the supplied cursor and this batch. */
  truncated: z.ZodOptional<z.ZodBoolean>;
  /** Whether more events are ready now; poll again at once, ignoring `nextPollMs`. */
  hasMore: z.ZodOptional<z.ZodBoolean>;
  /** The recommended wait before the next poll. */
  nextPollMs: z.ZodOptional<z.ZodNumber>;
  _meta: z.ZodOptional<z.ZodObject<{
    readonly "io.modelcontextprotocol/serverInfo": z.ZodCatch<z.ZodOptional<z.ZodObject<{
      version: z.ZodString;
      websiteUrl: z.ZodOptional<z.ZodString>;
      description: z.ZodOptional<z.ZodString>;
      icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        theme: z.ZodOptional<z.ZodEnum<{
          dark: "dark";
          light: "light";
        }>>;
      }, z.core.$strip>>>;
      name: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
  }, z.core.$loose>>;
}, z.core.$loose>;
/**
 * Params of `events/stream`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const StreamEventsRequestParamsSchema: z.ZodObject<{
  /** Suggested heartbeat interval; the server's grant in `notifications/events/active` is authoritative. */
  heartbeatMs: z.ZodOptional<z.ZodNumber>;
  /** The event type name. */
  name: z.ZodString;
  /** Subscription arguments, valid against the event type's `inputSchema`. */
  arguments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  /** Where to start: `null` (or absent) means now. */
  cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  /** Do not replay events older than this many milliseconds. */
  maxAgeMs: z.ZodOptional<z.ZodNumber>;
  _meta: z.ZodOptional<z.ZodObject<{
    progressToken: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    "io.modelcontextprotocol/related-task": z.ZodOptional<z.ZodObject<{
      taskId: z.ZodString;
    }, z.core.$strip>>;
  }, z.core.$loose>>;
}, z.core.$loose>;
/**
 * Result of `events/stream`: the empty final frame when the server closes the stream.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const StreamEventsResultSchema: z.ZodObject<{
  _meta: z.ZodOptional<z.ZodObject<{
    readonly "io.modelcontextprotocol/serverInfo": z.ZodCatch<z.ZodOptional<z.ZodObject<{
      version: z.ZodString;
      websiteUrl: z.ZodOptional<z.ZodString>;
      description: z.ZodOptional<z.ZodString>;
      icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        theme: z.ZodOptional<z.ZodEnum<{
          dark: "dark";
          light: "light";
        }>>;
      }, z.core.$strip>>>;
      name: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
  }, z.core.$loose>>;
}, z.core.$loose>;
/**
 * The `delivery` object of `events/subscribe`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const WebhookDeliverySchema: z.ZodObject<{
  mode: z.ZodLiteral<"webhook">;
  /** The `https` callback URL the server POSTs to. */
  url: z.ZodString;
  /** The Standard Webhooks signing secret: `whsec_` followed by base64 of 24 to 64 random bytes. */
  secret: z.ZodString;
}, z.core.$loose>;
/**
 * The `delivery` object of `events/unsubscribe`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const WebhookTargetSchema: z.ZodObject<{
  /** The callback URL of the subscription to remove. */
  url: z.ZodString;
}, z.core.$loose>;
/**
 * Params of `events/subscribe`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const SubscribeEventsRequestParamsSchema: z.ZodObject<{
  delivery: z.ZodObject<{
    mode: z.ZodLiteral<"webhook">;
    /** The `https` callback URL the server POSTs to. */
    url: z.ZodString;
    /** The Standard Webhooks signing secret: `whsec_` followed by base64 of 24 to 64 random bytes. */
    secret: z.ZodString;
  }, z.core.$loose>;
  /** Suggested lifetime: absent asks for the server default, `null` for no expiry. */
  ttlMs: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  /** The event type name. */
  name: z.ZodString;
  /** Subscription arguments, valid against the event type's `inputSchema`. */
  arguments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  /** Where to start: `null` (or absent) means now. */
  cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  /** Do not replay events older than this many milliseconds. */
  maxAgeMs: z.ZodOptional<z.ZodNumber>;
  _meta: z.ZodOptional<z.ZodObject<{
    progressToken: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    "io.modelcontextprotocol/related-task": z.ZodOptional<z.ZodObject<{
      taskId: z.ZodString;
    }, z.core.$strip>>;
  }, z.core.$loose>>;
}, z.core.$loose>;
/**
 * Webhook delivery health, as an `events/subscribe` refresh may report it.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const DeliveryStatusSchema: z.ZodObject<{
  /** Whether the server is delivering; `false` means retries were suspended until this refresh. */
  active: z.ZodBoolean;
  lastDeliveryAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  lastError: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
    challenge_failed: "challenge_failed";
    connection_refused: "connection_refused";
    http_4xx: "http_4xx";
    http_5xx: "http_5xx";
    timeout: "timeout";
    tls_error: "tls_error";
  }>>>;
  failedSince: z.ZodOptional<z.ZodString>;
  /** Whether the server is rate-limiting deliveries (delayed, not failing). */
  throttled: z.ZodOptional<z.ZodBoolean>;
  retryAfterMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$loose>;
/**
 * Result of `events/subscribe`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const SubscribeEventsResultSchema: z.ZodObject<{
  /** Server-derived subscription id, sent as `X-MCP-Subscription-Id` on every delivery. */
  id: z.ZodString;
  /** ISO 8601 time to refresh before; `null` grants no expiry. */
  refreshBefore: z.ZodNullable<z.ZodString>;
  /** Safe-to-persist watermark; `null` without replay. */
  cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  truncated: z.ZodOptional<z.ZodBoolean>;
  deliveryStatus: z.ZodOptional<z.ZodObject<{
    /** Whether the server is delivering; `false` means retries were suspended until this refresh. */
    active: z.ZodBoolean;
    lastDeliveryAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastError: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
      challenge_failed: "challenge_failed";
      connection_refused: "connection_refused";
      http_4xx: "http_4xx";
      http_5xx: "http_5xx";
      timeout: "timeout";
      tls_error: "tls_error";
    }>>>;
    failedSince: z.ZodOptional<z.ZodString>;
    /** Whether the server is rate-limiting deliveries (delayed, not failing). */
    throttled: z.ZodOptional<z.ZodBoolean>;
    retryAfterMs: z.ZodOptional<z.ZodNumber>;
  }, z.core.$loose>>;
  _meta: z.ZodOptional<z.ZodObject<{
    readonly "io.modelcontextprotocol/serverInfo": z.ZodCatch<z.ZodOptional<z.ZodObject<{
      version: z.ZodString;
      websiteUrl: z.ZodOptional<z.ZodString>;
      description: z.ZodOptional<z.ZodString>;
      icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        theme: z.ZodOptional<z.ZodEnum<{
          dark: "dark";
          light: "light";
        }>>;
      }, z.core.$strip>>>;
      name: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
  }, z.core.$loose>>;
}, z.core.$loose>;
/**
 * Params of `events/unsubscribe`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const UnsubscribeEventsRequestParamsSchema: z.ZodObject<{
  name: z.ZodString;
  arguments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  delivery: z.ZodObject<{
    /** The callback URL of the subscription to remove. */
    url: z.ZodString;
  }, z.core.$loose>;
  _meta: z.ZodOptional<z.ZodObject<{
    progressToken: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    "io.modelcontextprotocol/related-task": z.ZodOptional<z.ZodObject<{
      taskId: z.ZodString;
    }, z.core.$strip>>;
  }, z.core.$loose>>;
}, z.core.$loose>;
/**
 * Result of `events/unsubscribe`: an empty result.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const UnsubscribeEventsResultSchema: z.ZodObject<{
  _meta: z.ZodOptional<z.ZodObject<{
    readonly "io.modelcontextprotocol/serverInfo": z.ZodCatch<z.ZodOptional<z.ZodObject<{
      version: z.ZodString;
      websiteUrl: z.ZodOptional<z.ZodString>;
      description: z.ZodOptional<z.ZodString>;
      icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        theme: z.ZodOptional<z.ZodEnum<{
          dark: "dark";
          light: "light";
        }>>;
      }, z.core.$strip>>>;
      name: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
  }, z.core.$loose>>;
}, z.core.$loose>;
/**
 * Params of `notifications/events/active`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EventsActiveNotificationParamsSchema: z.ZodObject<{
  cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  truncated: z.ZodOptional<z.ZodBoolean>;
  /** The granted heartbeat interval. */
  heartbeatMs: z.ZodNumber;
  _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$loose>;
/**
 * Params of `notifications/events/event`: one event occurrence.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EventNotificationParamsSchema: z.ZodObject<{
  /** Stable identifier of the upstream event, for deduplication within a subscription. */
  eventId: z.ZodString;
  name: z.ZodString;
  /** ISO 8601 time the event occurred. */
  timestamp: z.ZodString;
  /** Payload conforming to the event type's `payloadSchema`. */
  data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
  /** Subscription position after this event (push and webhook); `null` without replay. */
  cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$loose>;
/**
 * Params of `notifications/events/heartbeat`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EventsHeartbeatNotificationParamsSchema: z.ZodObject<{
  /** The position the server has checked up to. */
  cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$loose>;
/**
 * Params of `notifications/events/error`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EventsErrorNotificationParamsSchema: z.ZodObject<{
  error: z.ZodObject<{
    code: z.ZodNumber;
    message: z.ZodString;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }, z.core.$loose>;
  _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$loose>;
/**
 * Params of `notifications/events/terminated`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EventsTerminatedNotificationParamsSchema: z.ZodObject<{
  error: z.ZodObject<{
    code: z.ZodNumber;
    message: z.ZodString;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }, z.core.$loose>;
  _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$loose>;
/**
 * Webhook control body: a gap between refreshes, with the fresh cursor to persist.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const WebhookGapBodySchema: z.ZodObject<{
  type: z.ZodLiteral<"gap">;
  cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$loose>;
/**
 * Webhook control body: the subscription has ended.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const WebhookTerminatedBodySchema: z.ZodObject<{
  type: z.ZodLiteral<"terminated">;
  error: z.ZodObject<{
    code: z.ZodNumber;
    message: z.ZodString;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }, z.core.$loose>;
}, z.core.$loose>;
/**
 * Webhook control body: the endpoint verification challenge, echoed back in a `2xx` body.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const WebhookVerificationBodySchema: z.ZodObject<{
  type: z.ZodLiteral<"verification">;
  challenge: z.ZodString;
}, z.core.$loose>;
/**
 * Any webhook control body; a webhook body without a top-level `type` is an event occurrence.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const WebhookControlBodySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  type: z.ZodLiteral<"gap">;
  cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$loose>, z.ZodObject<{
  type: z.ZodLiteral<"terminated">;
  error: z.ZodObject<{
    code: z.ZodNumber;
    message: z.ZodString;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }, z.core.$loose>;
}, z.core.$loose>, z.ZodObject<{
  type: z.ZodLiteral<"verification">;
  challenge: z.ZodString;
}, z.core.$loose>], "type">;
/**
 * The value at `capabilities.extensions["io.modelcontextprotocol/events"]`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EventsCapabilitySchema: z.ZodObject<{
  /** Whether the server sends `notifications/events/list_changed`. */
  listChanged: z.ZodOptional<z.ZodBoolean>;
}, z.core.$loose>;
//#endregion
//#region src/ext/events/types.d.ts
/**
 * `poll`, `push` or `webhook`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type DeliveryMode = z.infer<typeof DeliveryModeSchema>;
/**
 * A webhook delivery failure category.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type DeliveryErrorCategory = z.infer<typeof DeliveryErrorCategorySchema>;
/**
 * An event type as `events/list` describes it.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type EventDescriptor = z.infer<typeof EventDescriptorSchema>;
/**
 * One delivered event.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type EventOccurrence = z.infer<typeof EventOccurrenceSchema>;
/**
 * The error object Events carries in notifications and the webhook `terminated` body.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type EventsErrorObject = z.infer<typeof EventsErrorObjectSchema>;
/**
 * Params of `events/list`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type ListEventsRequestParams = z.infer<typeof ListEventsRequestParamsSchema>;
/**
 * Result of `events/list`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type ListEventsResult = z.infer<typeof ListEventsResultSchema>;
/**
 * Params of `events/poll`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type PollEventsRequestParams = z.infer<typeof PollEventsRequestParamsSchema>;
/**
 * Result of `events/poll`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type PollEventsResult = z.infer<typeof PollEventsResultSchema>;
/**
 * Params of `events/stream`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type StreamEventsRequestParams = z.infer<typeof StreamEventsRequestParamsSchema>;
/**
 * Result of `events/stream`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type StreamEventsResult = z.infer<typeof StreamEventsResultSchema>;
/**
 * The `delivery` object of `events/subscribe`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;
/**
 * The `delivery` object of `events/unsubscribe`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type WebhookTarget = z.infer<typeof WebhookTargetSchema>;
/**
 * Params of `events/subscribe`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type SubscribeEventsRequestParams = z.infer<typeof SubscribeEventsRequestParamsSchema>;
/**
 * Result of `events/subscribe`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type SubscribeEventsResult = z.infer<typeof SubscribeEventsResultSchema>;
/**
 * Webhook delivery health, as an `events/subscribe` refresh may report it.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;
/**
 * Params of `events/unsubscribe`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type UnsubscribeEventsRequestParams = z.infer<typeof UnsubscribeEventsRequestParamsSchema>;
/**
 * Result of `events/unsubscribe`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type UnsubscribeEventsResult = z.infer<typeof UnsubscribeEventsResultSchema>;
/**
 * Params of `notifications/events/active`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type EventsActiveNotificationParams = z.infer<typeof EventsActiveNotificationParamsSchema>;
/**
 * Params of `notifications/events/event`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type EventNotificationParams = z.infer<typeof EventNotificationParamsSchema>;
/**
 * Params of `notifications/events/heartbeat`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type EventsHeartbeatNotificationParams = z.infer<typeof EventsHeartbeatNotificationParamsSchema>;
/**
 * Params of `notifications/events/error`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type EventsErrorNotificationParams = z.infer<typeof EventsErrorNotificationParamsSchema>;
/**
 * Params of `notifications/events/terminated`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type EventsTerminatedNotificationParams = z.infer<typeof EventsTerminatedNotificationParamsSchema>;
/**
 * Webhook `gap` control body.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type WebhookGapBody = z.infer<typeof WebhookGapBodySchema>;
/**
 * Webhook `terminated` control body.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type WebhookTerminatedBody = z.infer<typeof WebhookTerminatedBodySchema>;
/**
 * Webhook `verification` control body.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type WebhookVerificationBody = z.infer<typeof WebhookVerificationBodySchema>;
/**
 * Any webhook control body, discriminated on `type`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type WebhookControlBody = z.infer<typeof WebhookControlBodySchema>;
/**
 * The value at `capabilities.extensions["io.modelcontextprotocol/events"]`.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
type EventsCapability = z.infer<typeof EventsCapabilitySchema>;
//#endregion
//#region src/ext/events/capability.d.ts
/**
 * Reads the Events extension capability out of a peer's advertised
 * capabilities, returning `undefined` when the peer does not advertise the
 * extension or advertises a malformed value.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare function eventsCapabilityOf(capabilities: CapabilitiesWithExtensions | undefined): EventsCapability | undefined;
//#endregion
//#region src/ext/events/constants.d.ts
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
declare const EVENTS_EXTENSION_ID = "io.modelcontextprotocol/events";
/**
 * Lists the event types a server offers.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EVENTS_LIST_METHOD = "events/list";
/**
 * Fetches the events of one subscription since a cursor (poll delivery).
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EVENTS_POLL_METHOD = "events/poll";
/**
 * Opens a long-lived stream for one subscription (push delivery).
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EVENTS_STREAM_METHOD = "events/stream";
/**
 * Creates or refreshes a webhook subscription (webhook delivery).
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EVENTS_SUBSCRIBE_METHOD = "events/subscribe";
/**
 * Removes a webhook subscription.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EVENTS_UNSUBSCRIBE_METHOD = "events/unsubscribe";
/**
 * Confirms a push stream, carrying the granted heartbeat interval; sent again mid-stream after a gap.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EVENTS_ACTIVE_NOTIFICATION = "notifications/events/active";
/**
 * Delivers one event occurrence on a push stream.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EVENTS_EVENT_NOTIFICATION = "notifications/events/event";
/**
 * Keeps a push stream alive and advances its cursor while no events match.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EVENTS_HEARTBEAT_NOTIFICATION = "notifications/events/heartbeat";
/**
 * Reports a recoverable failure on a push stream, which stays open.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EVENTS_ERROR_NOTIFICATION = "notifications/events/error";
/**
 * Ends a push subscription from the server side.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const EVENTS_TERMINATED_NOTIFICATION = "notifications/events/terminated";
/**
 * The header carrying the subscription `id` on every webhook POST.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const WEBHOOK_SUBSCRIPTION_ID_HEADER = "X-MCP-Subscription-Id";
/**
 * The delivery modes an event type can advertise.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const DELIVERY_MODES: readonly ["poll", "push", "webhook"];
/**
 * The categories a server reports as `deliveryStatus.lastError`, and as `data.reason` of a callback endpoint error.
 *
 * Experimental: Events (SEP-3415) is new; this API may change in a minor release.
 *
 * @experimental
 */
declare const DELIVERY_ERROR_CATEGORIES: readonly ["connection_refused", "timeout", "tls_error", "http_4xx", "http_5xx", "challenge_failed"];
//#endregion
export { DELIVERY_ERROR_CATEGORIES, DELIVERY_MODES, type DeliveryErrorCategory, DeliveryErrorCategorySchema, type DeliveryMode, DeliveryModeSchema, type DeliveryStatus, DeliveryStatusSchema, EVENTS_ACTIVE_NOTIFICATION, EVENTS_ERROR_NOTIFICATION, EVENTS_EVENT_NOTIFICATION, EVENTS_EXTENSION_ID, EVENTS_HEARTBEAT_NOTIFICATION, EVENTS_LIST_METHOD, EVENTS_POLL_METHOD, EVENTS_STREAM_METHOD, EVENTS_SUBSCRIBE_METHOD, EVENTS_TERMINATED_NOTIFICATION, EVENTS_UNSUBSCRIBE_METHOD, type EventDescriptor, EventDescriptorSchema, type EventNotificationParams, EventNotificationParamsSchema, type EventOccurrence, EventOccurrenceSchema, type EventsActiveNotificationParams, EventsActiveNotificationParamsSchema, type EventsCapability, EventsCapabilitySchema, type EventsErrorNotificationParams, EventsErrorNotificationParamsSchema, type EventsErrorObject, EventsErrorObjectSchema, type EventsHeartbeatNotificationParams, EventsHeartbeatNotificationParamsSchema, type EventsTerminatedNotificationParams, EventsTerminatedNotificationParamsSchema, type ListEventsRequestParams, ListEventsRequestParamsSchema, type ListEventsResult, ListEventsResultSchema, type PollEventsRequestParams, PollEventsRequestParamsSchema, type PollEventsResult, PollEventsResultSchema, type StreamEventsRequestParams, StreamEventsRequestParamsSchema, type StreamEventsResult, StreamEventsResultSchema, type SubscribeEventsRequestParams, SubscribeEventsRequestParamsSchema, type SubscribeEventsResult, SubscribeEventsResultSchema, type UnsubscribeEventsRequestParams, UnsubscribeEventsRequestParamsSchema, type UnsubscribeEventsResult, UnsubscribeEventsResultSchema, WEBHOOK_SUBSCRIPTION_ID_HEADER, type WebhookControlBody, WebhookControlBodySchema, type WebhookDelivery, WebhookDeliverySchema, type WebhookGapBody, WebhookGapBodySchema, type WebhookTarget, WebhookTargetSchema, type WebhookTerminatedBody, WebhookTerminatedBodySchema, type WebhookVerificationBody, WebhookVerificationBodySchema, eventsCapabilityOf };
