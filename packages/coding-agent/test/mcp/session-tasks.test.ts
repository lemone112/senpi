import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ExtensionAPI } from "../../src/core/extensions/types.ts";
import {
	McpSessionTasks,
	MCP_TASK_REFERENCE_ENTRY,
	mcpTaskDeliveryId,
	type McpTaskReference,
} from "../../src/core/extensions/builtin/mcp/session-tasks.ts";
import { callModernTool, validateCompletedMcpTaskResult } from "../../src/core/extensions/builtin/mcp/modern/tools.ts";
import { createMcpRequestOrigin, mcpRequestOptions } from "../../src/core/extensions/builtin/mcp/request-origin.ts";
import { cleanupMrtrLifecycle, fixture } from "./fixtures/mrtr-lifecycle.ts";

const seed = {
	resultType: "task",
	taskId: "accepted-task",
	status: "working" as const,
	createdAt: "2026-11-21T00:00:00Z",
	lastUpdatedAt: "2026-11-21T00:00:00Z",
	ttlMs: null,
};
const pointer = { server: "test", configHash: "declared-config", generationHash: "resolved-config", tool: "work" };
const lifetimes: AbortController[] = [];
afterEach(async () => {
	for (const lifetime of lifetimes.splice(0)) lifetime.abort();
	await vi.runAllTimersAsync();
	await cleanupMrtrLifecycle();
});

function hostFixture(entries: unknown[] = [], sessionId = "same-session") {
	vi.useFakeTimers();
	const lifetime = new AbortController();
	lifetimes.push(lifetime);
	const pending: string[] = [];
	const emitted: string[] = [];
	const close = vi.fn();
	const admit = vi.fn((input: { delivery_id: string }) => {
		pending.push(input.delivery_id);
		return { kind: "queued", turn_epoch: 1 };
	});
	const host = {
		appendEntry: vi.fn((customType, data) => entries.push({ type: "custom", customType, data })),
		session: {
			persistHeaderNow: vi.fn(async () => {}),
			listAdmittedDeliveries: () => ({ pending, emitted }),
			admitExternalMessage: admit,
		},
		lifecycle: { obligations: { open: vi.fn(() => ({ close })) } },
	} as unknown as Pick<ExtensionAPI, "appendEntry" | "session" | "lifecycle">;
	const observe = vi.fn(async (_reference: McpTaskReference, _signal: AbortSignal) => "result");
	const onError = vi.fn();
	const observer = new McpSessionTasks({
		host,
		entries: () => entries,
		sessionId,
		signal: lifetime.signal,
		observe,
		onError,
	});
	return { observer, host, lifetime, entries, pending, emitted, close, admit, observe, onError };
}

describe("accepted MCP work belongs to the session", () => {
	it("returns acceptance only after persistence, without polling or validating it as final output", async () => {
		const f = await fixture([seed], true);
		const durable = Promise.withResolvers<void>();
		const accepted = vi.fn(() => durable.promise);
		const origin = createMcpRequestOrigin({ ...f.origin(), acceptTask: accepted });
		let resolved = false;
		const call = callModernTool(
			f.client,
			{ name: "work" },
			{ type: "object", required: ["answer"] },
			mcpRequestOptions(origin),
		).then((value) => {
			resolved = true;
			return value;
		});
		await vi.waitFor(() => expect(accepted).toHaveBeenCalledOnce());
		expect(resolved).toBe(false);
		durable.resolve();
		expect(JSON.stringify(await call)).toContain("accepted-task");
		expect(f.transport.calls).toHaveLength(1);
		expect(f.clock.timers.size).toBe(0);
	});

	it("does not turn a failed reference write into completion or cancellation", async () => {
		const f = await fixture([seed], true);
		const origin = createMcpRequestOrigin({
			...f.origin(),
			acceptTask: async () => {
				throw new Error("disk full");
			},
		});
		await expect(
			callModernTool(f.client, { name: "work" }, undefined, mcpRequestOptions(origin)),
		).rejects.toMatchObject({ code: "MCP_TASK_PERSIST_FAILED", taskId: seed.taskId });
		expect(f.transport.calls).toHaveLength(1);
	});

	it.each(["outputSchema", "content"])(
		"delivers an invalid completed %s once instead of retrying observation",
		async (kind) => {
			const f = hostFixture();
			f.observe.mockImplementation(async (reference) =>
				JSON.stringify(
					await validateCompletedMcpTaskResult(
						{
							content:
								kind === "content" ? [{ type: "text", text: 42 }] : [{ type: "text", text: "bad output" }],
						},
						kind === "outputSchema" ? { type: "object", required: ["answer"] } : undefined,
						reference.taskId,
					),
				),
			);
			await f.observer.accept(pointer, seed);
			await vi.waitFor(() => expect(f.admit).toHaveBeenCalledOnce());
			expect(f.admit.mock.calls[0][0]).toMatchObject({ text: expect.stringContaining(seed.taskId) });
			expect(f.admit.mock.calls[0][0]).toMatchObject({ text: expect.stringContaining('"isError":true') });
			expect(f.admit.mock.calls[0][0]).toMatchObject({
				text: expect.stringContaining(
					kind === "content" ? "MCP_MRTR_INVALID_RESULT" : "MCP_OUTPUT_SCHEMA_MISMATCH",
				),
			});
			await vi.advanceTimersByTimeAsync(31_000);
			expect(f.observe).toHaveBeenCalledOnce();
			expect(f.onError).not.toHaveBeenCalled();
			f.emitted.push(f.pending[0]);
			await vi.advanceTimersByTimeAsync(30_000);
			expect(f.close).toHaveBeenCalledWith("consumed");
		},
	);

	it.each([
		{ inputRequests: {} },
		{ inputResponses: {} },
		{ requestState: "invalid-final-state" },
		{ resultType: "input_required" },
		{ _meta: 42 },
	])("delivers invalid completed envelopes from the real adapter once: %j", async (fields) => {
		const f = await fixture(
			[
				{
					...seed,
					resultType: "complete",
					status: "completed",
					result: { content: [{ type: "text", text: "invalid envelope" }], ...fields },
				},
			],
			true,
		);
		const host = hostFixture();
		host.observe.mockImplementation(async (reference, signal) =>
			JSON.stringify(
				await f.client.request(
					{ method: "tasks/get", params: { taskId: reference.taskId } },
					ResultSchema,
					mcpRequestOptions(createMcpRequestOrigin({ ...f.origin(), observingTaskId: reference.taskId }), {
						signal,
					}),
				),
			),
		);
		await host.observer.accept(pointer, seed);
		await vi.waitFor(() => expect(host.admit).toHaveBeenCalledOnce());
		expect(host.admit.mock.calls[0][0]).toMatchObject({
			text: expect.stringContaining(`Task ${seed.taskId}: Task completed, but its final result is invalid`),
		});
		await vi.advanceTimersByTimeAsync(31_000);
		expect(host.observe).toHaveBeenCalledOnce();
		expect(host.onError).not.toHaveBeenCalled();
		expect(f.transport.calls).toMatchObject([{ method: "tasks/get", params: { taskId: seed.taskId } }]);
	});

	it("does not turn a malformed pre-completion observation into a terminal result", async () => {
		const f = await fixture(
			[
				{ ...seed, resultType: "complete", status: "invalid" },
				{
					...seed,
					resultType: "complete",
					status: "completed",
					result: { content: [{ type: "text", text: "recovered result" }] },
				},
			],
			true,
		);
		const host = hostFixture();
		host.observe.mockImplementation(async (reference, signal) =>
			JSON.stringify(
				await f.client.request(
					{ method: "tasks/get", params: { taskId: reference.taskId } },
					ResultSchema,
					mcpRequestOptions(createMcpRequestOrigin({ ...f.origin(), observingTaskId: reference.taskId }), {
						signal,
					}),
				),
			),
		);
		await host.observer.accept(pointer, seed);
		await vi.waitFor(() => expect(host.onError).toHaveBeenCalledOnce());
		expect(host.admit).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1000);
		expect(host.admit).toHaveBeenCalledOnce();
		expect(host.admit.mock.calls[0][0]).toMatchObject({ text: expect.stringContaining("recovered result") });
		expect(f.transport.calls).toHaveLength(2);
	});

	it("persists the pointer before observing and waits for native emitted history, not queue admission", async () => {
		const f = hostFixture();
		await f.observer.accept(pointer, seed);
		await vi.advanceTimersByTimeAsync(0);
		expect(f.host.session.persistHeaderNow).toHaveBeenCalledOnce();
		expect(f.entries[0]).toMatchObject({
			type: "custom",
			customType: MCP_TASK_REFERENCE_ENTRY,
			data: { taskId: seed.taskId },
		});
		expect(f.admit).toHaveBeenCalledOnce();
		expect(f.close).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1000);
		expect(f.observe).toHaveBeenCalledOnce();
		expect(f.admit).toHaveBeenCalledOnce();
		f.emitted.push(f.pending[0]);
		await vi.advanceTimersByTimeAsync(2000);
		expect(f.close).toHaveBeenCalledWith("consumed");
	});

	it("recovers the same accepted ID after stopping before admission and after transient observation failure", async () => {
		const f = hostFixture();
		const firstRead = Promise.withResolvers<string>();
		f.observe.mockImplementationOnce(() => firstRead.promise);
		await f.observer.accept(pointer, seed);
		f.lifetime.abort();
		firstRead.resolve("result after stop");
		await vi.advanceTimersByTimeAsync(0);
		expect(f.admit).not.toHaveBeenCalled();
		const resumed = hostFixture(f.entries);
		resumed.observe.mockRejectedValueOnce(new TypeError("temporary disconnect"));
		await vi.advanceTimersByTimeAsync(0);
		expect(resumed.admit).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1000);
		expect(resumed.observe.mock.calls.map(([reference]) => reference.taskId)).toEqual([seed.taskId, seed.taskId]);
		expect(resumed.admit).toHaveBeenCalledOnce();
		expect(f.entries).toHaveLength(1);
	});

	it("does not redeliver after an emitted receipt or move another session's tasks into a fork", async () => {
		const reference = { ...pointer, version: 1, sessionId: "same-session", taskId: seed.taskId } as const;
		const entries = [{ type: "custom", customType: MCP_TASK_REFERENCE_ENTRY, data: reference }];
		const fork = hostFixture(entries, "fork-session");
		const resumed = hostFixture([
			...entries,
			{
				type: "custom_message",
				customType: "session_control_delivery",
				details: { delivery_id: mcpTaskDeliveryId(reference) },
			},
		]);
		await vi.advanceTimersByTimeAsync(0);
		expect(fork.observe).not.toHaveBeenCalled();
		expect(resumed.observe).not.toHaveBeenCalled();
	});

	it("observes a ninth ready task while earlier tasks remain unavailable", async () => {
		const f = hostFixture();
		f.observe.mockImplementation(async (reference, signal) =>
			f.observer.request(async () => {
				if (reference.taskId !== "ready-9") throw new Error("temporarily unavailable");
				return "ninth result";
			}, signal),
		);
		for (let i = 1; i <= 9; i++) await f.observer.accept(pointer, { ...seed, taskId: `ready-${i}` });
		await vi.advanceTimersByTimeAsync(0);
		expect(f.admit).toHaveBeenCalledOnce();
		expect(f.admit.mock.calls[0][0]).toMatchObject({ text: expect.stringContaining("ninth result") });
	});

	it("bounds wire requests and releases a slot when a queued request is cancelled", async () => {
		const f = hostFixture();
		const release = Promise.withResolvers<string>();
		const started = vi.fn(() => release.promise);
		const busy = Array.from({ length: 8 }, () => f.observer.request(started, f.lifetime.signal));
		const cancelled = new AbortController();
		const skipped = vi.fn(async () => "must not run");
		const ninth = f.observer.request(skipped, cancelled.signal);
		const rejected = expect(ninth).rejects.toThrow("stop queued request");
		const last = vi.fn(async () => "last");
		const tenth = f.observer.request(last, f.lifetime.signal);
		expect(started).toHaveBeenCalledTimes(8);
		expect(last).not.toHaveBeenCalled();
		cancelled.abort(new Error("stop queued request"));
		await rejected;
		release.resolve("done");
		await Promise.all(busy);
		expect(await tenth).toBe("last");
		expect(skipped).not.toHaveBeenCalled();
		expect(await f.observer.request(async () => "still open", f.lifetime.signal)).toBe("still open");
	});

	it("yields after native admission closes so session release can abort observation", async () => {
		const f = hostFixture();
		vi.spyOn(f.host.session, "listAdmittedDeliveries").mockImplementation(() => {
			throw new Error("admission closed");
		});
		await f.observer.accept(pointer, seed);
		await vi.advanceTimersByTimeAsync(0);
		expect(f.onError).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(29_999);
		expect(f.onError).toHaveBeenCalledOnce();
		f.lifetime.abort();
		await vi.advanceTimersByTimeAsync(1);
		expect(f.onError).toHaveBeenCalledOnce();
	});

	it("delivers changed status without a form and treats a repeated notice after clear as a new episode", async () => {
		const f = hostFixture();
		const reference = { ...pointer, version: 1, sessionId: "same-session", taskId: seed.taskId } as const;
		const status = {
			taskId: seed.taskId,
			status: "working",
			statusMessage: "Browser help: https://private.test/lease",
		};
		const render = vi.fn(async (text: string) => text);
		await f.observer.progress(reference, status, render);
		await f.observer.progress(reference, status, render);
		expect(f.admit).toHaveBeenCalledOnce();
		expect(JSON.stringify(f.entries)).not.toContain("https://private.test");
		await f.observer.progress(reference, { ...status, statusMessage: undefined }, render);
		await f.observer.progress(reference, status, render);
		expect(f.admit).toHaveBeenCalledTimes(2);
		expect(f.pending[0]).not.toBe(f.pending[1]);
		expect(render).toHaveBeenCalledTimes(2);
	});

	it("retries a queued status after restart but does not repeat an emitted status", async () => {
		const f = hostFixture();
		const reference = { ...pointer, version: 1, sessionId: "same-session", taskId: seed.taskId } as const;
		const status = { taskId: seed.taskId, status: "working", statusMessage: "Help requested" };
		const render = async (text: string) => text;
		await f.observer.progress(reference, status, render);
		f.lifetime.abort();
		const resumed = hostFixture(f.entries);
		await resumed.observer.progress(reference, status, render);
		expect(resumed.pending).toEqual(f.pending);
		resumed.entries.push({
			type: "custom_message",
			customType: "session_control_delivery",
			details: { delivery_id: resumed.pending[0] },
		});
		resumed.lifetime.abort();
		const delivered = hostFixture(resumed.entries);
		await delivered.observer.progress(reference, status, render);
		expect(delivered.admit).not.toHaveBeenCalled();
	});
});
