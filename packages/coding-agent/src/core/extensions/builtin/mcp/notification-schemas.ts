/**
 * Lightweight validation for host catalog/resource/log receivers. These synchronous
 * registrations stay outside the lazy SDK graph. The same receiver handles legacy
 * method notifications and the native SDK listen callback's acknowledged stream.
 */
import { type ZodType, z } from "zod/v3";

/** The one method of the SDK client these subscriptions use. */
export interface McpNotificationClient<TNotification> {
	setNotificationHandler(method: string, handler: (notification: TNotification) => void): void;
}

const receivers = new WeakMap<object, Map<string, (notification: unknown) => void>>();
export function dispatchMcpNotification(client: object, notification: { method: string }): void {
	receivers.get(client)?.get(notification.method)?.(notification);
}

export function registerMcpNotificationHandler<TNotification>(
	client: McpNotificationClient<TNotification>,
	schema: ZodType<TNotification>,
	handler: (notification: TNotification) => void,
): void {
	const method = (schema as unknown as { shape: { method: { value: string } } }).shape.method.value;
	const receive = (notification: unknown) => {
		const parsed = schema.safeParse(notification);
		if (parsed.success) handler(parsed.data);
	};
	let handlers = receivers.get(client);
	if (!handlers) receivers.set(client, (handlers = new Map()));
	handlers.set(method, receive);
	client.setNotificationHandler(method, receive);
}

export interface McpListChangedNotification {
	readonly method: string;
}

export interface McpResourceUpdatedNotification {
	readonly method: string;
	readonly params: { readonly uri: string };
}

export interface McpLoggingMessageNotification {
	readonly method: string;
	readonly params: { readonly level: string; readonly logger?: string; readonly data?: unknown };
}

const NotificationParamsSchema = z.object({ _meta: z.object({}).passthrough().optional() });

export const ToolListChangedNotificationSchema: ZodType<McpListChangedNotification> = z.object({
	method: z.literal("notifications/tools/list_changed"),
	params: NotificationParamsSchema.optional(),
});

export const ResourceListChangedNotificationSchema: ZodType<McpListChangedNotification> = z.object({
	method: z.literal("notifications/resources/list_changed"),
	params: NotificationParamsSchema.optional(),
});

export const PromptListChangedNotificationSchema: ZodType<McpListChangedNotification> = z.object({
	method: z.literal("notifications/prompts/list_changed"),
	params: NotificationParamsSchema.optional(),
});

export const ResourceUpdatedNotificationSchema: ZodType<McpResourceUpdatedNotification> = z.object({
	method: z.literal("notifications/resources/updated"),
	params: NotificationParamsSchema.extend({ uri: z.string() }),
});

export const LoggingMessageNotificationSchema: ZodType<McpLoggingMessageNotification> = z.object({
	method: z.literal("notifications/message"),
	params: NotificationParamsSchema.extend({
		level: z.enum(["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]),
		logger: z.string().optional(),
		data: z.unknown(),
	}),
});
