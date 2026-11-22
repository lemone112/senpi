// Runs only in the digest-pinned SDK build container, never during npm install.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ts = createRequire('/sdk/package.json')('typescript');
const declaration = (file, source) => {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  const visit = node => {
    // TypeScript 5's per-file emit can reorder an inferred ZodEnum map as
    // files are visited. Only this unordered string-to-itself dictionary is
    // canonicalized; overloads, unions, runtime values and exports retain order.
    if (ts.isTypeReferenceNode(node) && ts.isQualifiedName(node.typeName)
      && node.typeName.right.text === 'ZodEnum' && node.typeArguments?.length === 1) {
      const map = node.typeArguments[0];
      if (ts.isTypeLiteralNode(map) && map.members.length > 1
        && map.members.every(member => ts.isPropertySignature(member)
          && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
          && member.type && ts.isLiteralTypeNode(member.type) && ts.isStringLiteral(member.type.literal)
          && member.name.text === member.type.literal.text)) {
        const sorted = [...map.members].sort((a, b) => a.name.text < b.name.text ? -1 : a.name.text > b.name.text ? 1 : 0);
        if (sorted.some((member, index) => member !== map.members[index])) {
          edits.push({ start: map.members[0].getFullStart(), end: map.members.at(-1).end,
            text: sorted.map(member => source.slice(member.getFullStart(), member.end)).join('') });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source.replace(/^\/\/# sourceMappingURL=.*\r?\n?/gm, '');
};

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd });
  if (result.error || result.status !== 0) throw new Error(`SDK build failed: ${command}`);
};
const source = JSON.parse(readFileSync('/sdk/package.json', 'utf8'));
const lock = readFileSync('/sdk/pnpm-lock.yaml');
const patch = process.env.MCP_SDK_PATCH_SHA256;
if (!/^[a-f0-9]{64}$/.test(patch ?? '')) {
  throw new Error('Missing pinned SDK build inputs');
}
const core = JSON.parse(readFileSync('/sdk/packages/core/package.json', 'utf8')).version + `+labpics.${patch.slice(0, 12)}`;
// Client/server declaration generation resolves core's exported dist types.
// Build them first in the clean checkout; unresolved computed metadata keys
// otherwise silently collapse to {} even though runtime imports still work.
run('pnpm', ['--filter', '@modelcontextprotocol/core', 'build']);
for (const name of ['core', 'client', 'server']) {
  const path = `/sdk/packages/${name}/package.json`;
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  // Build metadata preserves the official peer ranges (a prerelease suffix
  // would not satisfy ^2.4.0), while provenance identifies the exact patch.
  manifest.version += `+labpics.${patch.slice(0, 12)}`;
  // A downstream package's npm overrides are ignored. Both packages resolve
  // the core version supplied alongside them in the same bundled dependency.
  if (name !== 'core') manifest.dependencies['@modelcontextprotocol/core'] = core;
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  run('pnpm', ['--filter', `@modelcontextprotocol/${name}`, 'pack', '--pack-destination', '/output']);
  const archive = `/output/modelcontextprotocol-${name}-${manifest.version}.tgz`;
  const unpacked = `/packed-${name}`;
  mkdirSync(unpacked);
  run('tar', ['-xzf', archive, '-C', unpacked]);
  const packedPath = `${unpacked}/package/package.json`;
  const packed = JSON.parse(readFileSync(packedPath, 'utf8'));
  // pnpm resolves workspace dependencies concurrently and emits their keys in
  // completion order. Canonicalize dependency maps only: exports order matters.
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (packed[field]) packed[field] = Object.fromEntries(Object.entries(packed[field]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  }
  writeFileSync(packedPath, JSON.stringify(packed, null, 2) + '\n');
  const normalizeDeclarations = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) normalizeDeclarations(file);
      // tsdown 0.18 emits nondeterministic declaration mappings. The source
      // patch preserves the declarations' origin; retain JS runtime maps.
      else if (/\.d\.[cm]ts\.map$/.test(entry.name)) rmSync(file);
      else if (/\.d\.[cm]ts$/.test(entry.name))
        writeFileSync(file, declaration(file, readFileSync(file, 'utf8')));
    }
  };
  normalizeDeclarations(`${unpacked}/package/dist`);
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', '/output'], `${unpacked}/package`);
  renameSync(archive, `/output/${name}.tgz`);
}
writeFileSync('/output/build.json', JSON.stringify({
  node: process.versions.node,
  packageManager: source.packageManager,
  lockSha256: createHash('sha256').update(lock).digest('hex'),
  core,
}, null, 2) + '\n');
