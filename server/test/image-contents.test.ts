import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join, dirname, resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverDir, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? sourceFiles(full)
      : full.endsWith('.ts')
        ? [full]
        : [];
  });
}

/** Every repo-root `src/…` module the server pulls in, following imports
 *  TRANSITIVELY — a shared file's own imports have to be in the image too, and
 *  missing those is just as fatal as missing the file the server names. */
function sharedImports(): string[] {
  const found = new Set<string>();
  const queue = sourceFiles(join(serverDir, 'src'));
  const seen = new Set<string>(queue);

  while (queue.length) {
    const file = queue.pop() as string;
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue; // Recorded as missing by the existence test below.
    }
    for (const m of text.matchAll(/from '(\.[^']+)'/g)) {
      let target = resolve(dirname(file), m[1]);
      if (!target.startsWith(join(repoRoot, 'src'))) {
        continue;
      }
      // Imports inside src/ are extensionless; server files carry `.ts`.
      if (!target.endsWith('.ts')) {
        target = existsSync(`${target}.ts`) ? `${target}.ts` : join(target, 'index.ts');
      }
      found.add(relative(repoRoot, target));
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return [...found].sort();
}

/** Repo-root paths the Dockerfile copies into the image. */
function copiedPaths(): string[] {
  const dockerfile = readFileSync(join(serverDir, 'Dockerfile'), 'utf8');
  return [...dockerfile.matchAll(/^COPY\s+(src\/\S+)\s/gm)].map(m => m[1]);
}

// The image builds cleanly whether or not the shared file is present — it only
// fails when Node resolves the import at startup, which is a crash loop behind
// the reverse proxy and a 502 for the user. This test is the cheap version of
// that discovery.
test('every shared app module the server imports is copied into the image', () => {
  const copied = copiedPaths();
  const missing = sharedImports().filter(
    imported => !copied.some(c => imported === c || imported.startsWith(`${c}/`)),
  );
  assert.deepEqual(
    missing,
    [],
    `Not COPYed in server/Dockerfile: ${missing.join(', ')}. ` +
      'Add a COPY line, or the container dies at startup with ERR_MODULE_NOT_FOUND.',
  );
});

test('the shared imports actually exist on disk', () => {
  for (const imported of sharedImports()) {
    assert.ok(
      statSync(join(repoRoot, imported)).isFile(),
      `${imported} is imported by the server but does not exist`,
    );
  }
});
