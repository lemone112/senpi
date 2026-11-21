## MCP accepted work survives observation failures and interactive session restarts

Interactive TUI/RPC sessions now persist an accepted modern MCP task reference before
returning control to the model, observe through the existing authorized connection,
and deliver the eventual result through native external admission. The persisted
delivery receipt prevents a second turn for the same result after restart. Stop,
quit, changed configuration, and transient task reads never cancel or resubmit
accepted background work. Print/JSON and nonpersistent sessions retain foreground
task behavior. Changed server status messages reach the chat without a redundant
form; receipt-backed episode digests suppress repeated polls and survive restart.

The builtin boundary is required because the modern request adapter previously
hid the accepted handle inside the originating tool call. The existing MRTR input
presenter and server task state remain authoritative; this adds no execution queue.
Task errors preserve the accepted ID, and `events/poll` sends its standard `Mcp-Name`
routing header. Merge-sensitive areas: modern request/tools boundary and MCP session
binding creation. Tests cover acceptance persistence, read failure, restart, shutdown
before admission, final-output validation boundary, and native receipt deduplication.

Observation bounds concurrent wire reads, so long-lived tasks cannot starve later
completed tasks. Configured request timeouts still apply to each read. The Windows
lint ratchet invokes the installed JavaScript entry point with bounded path batches.
