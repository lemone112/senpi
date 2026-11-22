import { afterEach, expect, it } from "vitest";
import { createHarness, type Harness } from "../harness.ts";

const harnesses: Harness[] = [];
afterEach(() => {
	for (const harness of harnesses.splice(0)) harness.cleanup();
});

it.each(["public abort", "caller signal"] as const)(
	"%s cancels preparation before a provider request and leaves the next prompt usable",
	async (cancel) => {
		const entered = Promise.withResolvers<AbortSignal | undefined>();
		let first = true;
		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.on("before_agent_start", async (_event, ctx) => {
						if (!first) return;
						first = false;
						entered.resolve(ctx.signal);
						if (!ctx.signal) throw new Error("Prompt preparation has no cancellation signal");
						await new Promise<void>((resolve) => {
							if (ctx.signal?.aborted) resolve();
							else ctx.signal?.addEventListener("abort", () => resolve(), { once: true });
						});
					});
				},
			],
		});
		harnesses.push(harness);
		const caller = new AbortController();
		const prompt = harness.session.prompt("first", { signal: caller.signal });
		const failed = expect(prompt).rejects.toMatchObject({ name: "AbortError" });
		const signal = await entered.promise;
		expect(signal).toBeDefined();
		if (cancel === "public abort") await harness.session.abort();
		else caller.abort();
		await failed;
		expect(signal?.aborted).toBe(true);
		expect(harness.faux.state.callCount).toBe(0);
		await harness.session.prompt("second");
		expect(harness.faux.state.callCount).toBe(1);
	},
);
