# Internal MCP SDK

Senpi uses the modular TypeScript SDK 2.4.0 with the scoped task-subscription patch
recorded in `source.patch`. `manifest.json` pins the upstream Git revision, patch,
build image and archive hashes. The top-level client and core archives are the same
artifacts qualified by Meta. `build.mjs` is their original reproducible container recipe.

`senpi/source.patch` adds a local stdio transport boundary: `resolveParameters`
authorizes fresh command, arguments, working directory and environment immediately
before each spawn, including the disposable discovery sibling. A rejected resolver
prevents the spawn; closing during resolution prevents a late process. The sibling
still discards stderr. `inheritEnvironment: false` passes the resolved environment to
spawn without the SDK's default inherited variables. Node may still supply required
platform variables on Windows. Ordinary SDK callers retain the default.
`beforeClose(pid)` lets the host reap the live process tree before either normal
close or disposable sibling teardown closes stdin or sends a signal. The policy
is retained from the constructor when process parameters are refreshed; a rejected
callback still falls through to ordinary SDK cleanup. It does not supervise a
process that exits by itself. Senpi supplies its existing process-tree reaper.
`senpi/manifest.json` pins this additional patch and the resulting client archive;
the core archive and the shared SDK inputs remain unchanged.

The same local patch adds `ClientOptions.modernCapabilities`. Its explicit value
controls both discovery (including disposable stdio probes) and default modern
request envelopes. Legacy initialization and local handler validation retain the
ordinary `capabilities`; omitting the option preserves the SDK's existing behavior,
including later `registerCapabilities` calls. Per-request metadata still takes
precedence, so Senpi can advertise an issuing interaction's human capabilities
without granting them to discovery or background requests.

The [Senpi overlay register](senpi/README.md) records its source delta, public
seams and removal criteria separately from the shared task-subscription patch.

`node scripts/prepare-mcp-sdk-vendor.mjs` verifies the base and Senpi inputs and materializes the
ESM modules, declarations and Apache license in
`packages/coding-agent/src/vendor/mcp/`. `--check` compares every generated file
without changing it. The only transformations are package-to-relative imports,
the Node shim selection, and removal of source map references. Client and core
therefore share one schema and protocol implementation.

The MCP lazy boundary imports these files. The normal `copy-assets` build copies
them to `dist/vendor/mcp/` for unbundled consumers; esbuild follows the same relative
imports for the CLI. No local dependency specification, bundled dependency tree,
package install hook, runtime download, or separately published SDK fork is used.
Registry dependencies imported by these modules are declared directly by Senpi.

`node scripts/rebuild-mcp-sdk.mjs` reproduces the Senpi client and shared core from the recorded
upstream revision and both source patches in the digest-pinned image and checks their hashes.
`--base` verifies the original shared archives alone. `--write` updates only the Senpi
client archive and its manifest after an intentional change to the local patch.
It requires Git, Docker and network access; ordinary builds require none of them.
To update the SDK, review the archive and manifest changes, regenerate, and run
the vendor check, native MCP tests and installed-package qualification. Do not edit
generated modules. The Node shim is intentional: MCP in Senpi runs in the host,
not the browser.

Sources: [official SDK](https://github.com/modelcontextprotocol/typescript-sdk),
[Node package resolution](https://nodejs.org/api/packages.html).
