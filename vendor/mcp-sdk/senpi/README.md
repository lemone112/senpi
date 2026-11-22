# Senpi-only SDK overlay

`source.patch` applies after the common SDK patch in `../source.patch`.
The common patch contains the task-subscription work qualified by Meta; it,
`../build.mjs`, the common archives and shared core are unchanged by this overlay.
`manifest.json` is authoritative for the local patch and client artifact hashes.

The current source delta is **227 added / 41 removed lines** across three SDK
files, measured against the already patched common SDK. Counts include comments
and replaced lines; generated modules, declarations, tests and packaging are
excluded. Recalculate with `git apply --numstat source.patch` after changing it.

| SDK file and delta | Purpose and public seam | Remove when |
| --- | --- | --- |
| `client/client.ts`: +79 / -11 | `ClientOptions.modernCapabilities` supplies the modern wire default while retaining legacy capabilities and local handler validation. Negotiated connect passes one deadline and signal through initial discovery, session attachment, legacy initialization and subscription acknowledgement. After a disposable probe timeout, an explicit initialize rejection can invoke native discovery once on the running child. | The adopted SDK provides equivalent capability projection and bounded negotiation; capability, cold modern, silent legacy and initial cancellation tests pass through its public API. |
| `client/stdio.ts`: +82 / -21 | `StdioServerParameters.resolveParameters` reauthorizes every spawn; `inheritEnvironment: false` disables the SDK environment merge; close invalidates pending resolution. `beforeClose(pid)` awaits the host's existing process-tree reaper before normal close or probe disposal. The constructor retains this lifecycle policy across descriptor refreshes. | The adopted SDK offers fresh authorized descriptors, explicit environment replacement and host cleanup before both stdio teardown paths. Retain the cancellation and descendant-lifetime tests during migration; a version bump alone is insufficient. |
| `client/versionNegotiation.ts`: +66 / -9 | Disposable siblings retain the same resolver and lifecycle policy while forcing `stderr: "ignore"`. Native startup and probe waits share the connect deadline and signal; every response is checked before acceptance. A provisional timeout verdict permits bounded discovery on the existing session channel. No new public option in this file. | The SDK preserves these lifecycle policies and can resolve an ambiguous cold-process timeout without consuming legacy initialization's budget. Retain fresh-descriptor, stderr, initial cancellation and negotiation checks. |

`beforeClose` receives a live root PID once per process. Its promise settles before
the SDK closes stdin or sends signals; if it already terminated the process, the
SDK skips those signals. Rejection preserves ordinary SDK teardown. It adds no
supervisor and does not recover descendants after a spontaneous root exit.
On Windows, Node may supply mandatory OS environment variables even when the SDK
merge is disabled; the option governs the SDK's merge, not Node/libuv behavior.

Cold stdio recovery is limited to `mode: "auto"`, an actual disposable probe
timeout, and a subsequent initialize rejection with `-32601` or `-32020`. The
short initial probe remains intact. Successful initialize fixes the connection
to legacy, even for a dual-era peer. Other errors, HTTP, pin mode and prior
legacy verdicts do not enter recovery. A recovery discovery reuses the native
classifier with no legacy fallback or timeout resends, and must finish within
the original connect deadline and signal. Failure closes the session child.

The same deadline and signal apply from the initial probe, including pending
descriptor resolution, and are checked after disposable cleanup and session
attachment. A delayed success cannot establish a cancelled or expired connection.
Cleanup is awaited after cancellation; process teardown may outlast the request
budget. A resolver completing after cleanup cannot start a new child.

`scripts/mcp-stdio-resolver.test.mjs` exercises the real process and wire boundaries,
including liveness checks inside the running test process so runner cleanup cannot
hide an orphan. The Linux descendant check failed on the preceding overlay and
passes with `beforeClose` connected to Senpi's existing reaper. Package qualification
runs the same scenarios against the installed archive and checks declarations
without `skipLibCheck`.
`packages/coding-agent/test/mcp/stdio-negotiation.test.ts` verifies the configured
host budget through the real SDK and child pipes for cold modern and silent legacy.
`scripts/mcp-negotiation.test.mjs` checks initial cancellation and expiry through
the actual HTTP transport against a local server, including a peer that still
answers successfully after cancellation.

References: [SDK client](https://github.com/modelcontextprotocol/typescript-sdk),
[Node child process lifetime](https://nodejs.org/api/child_process.html#subprocesskillsignal),
[MCP stdio fallback](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio#backward-compatibility).
