#!/usr/bin/env bun
/**
 * Guards the branch's other core promise: `examples/demo-react/src/catalog.ts`'s CATALOG entries
 * agree, id for id, with what `examples/demo-agentos/server.py` actually registers on AgentOS.
 *
 * The catalog is parsed from source (it's a small literal array); the server side is introspected
 * live via `examples/demo-agentos/check_catalog.py`, which imports the real `server` module and
 * reads `server.agent_os.{agents,teams,workflows}` — the same approach CI's demo-agentos
 * import-check step already uses — rather than parsing server.py with regex.
 *
 * Requires `uv sync` to have already run in examples/demo-agentos (CI runs this right after that
 * step). Run from the repo root: `bun run scripts/check-demo-catalog.ts`.
 */

const CATALOG_PATH = 'examples/demo-react/src/catalog.ts'
const DEMO_AGENTOS_DIR = 'examples/demo-agentos'

type Kind = 'agent' | 'team' | 'workflow'
const KINDS: Kind[] = ['agent', 'team', 'workflow']

interface CatalogRow { kind: Kind; id: string }

function parseCatalog(source: string): CatalogRow[] {
  const rows: CatalogRow[] = []
  // Each row is an object literal on its own line: { kind: 'agent', id: 'chat', ... }
  const rowRe = /\{\s*kind:\s*'(\w+)'\s*,\s*id:\s*'([^']+)'/g
  for (const m of source.matchAll(rowRe)) rows.push({ kind: m[1] as Kind, id: m[2]! })
  return rows
}

async function serverIds(): Promise<Record<Kind, string[]>> {
  const proc = Bun.spawn(['uv', 'run', '--python', '3.12', 'python', 'check_catalog.py'], {
    cwd: DEMO_AGENTOS_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    console.error(stderr)
    throw new Error(`check_catalog.py exited with code ${exitCode}`)
  }
  // check_catalog.py's own JSON is the last non-empty stdout line; agno/uvicorn log noise (e.g.
  // "INFO Adding AgentOS auth middleware...") can precede it on stdout.
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  const jsonLine = lines.at(-1)
  if (!jsonLine) throw new Error(`check_catalog.py produced no output.\nstderr:\n${stderr}`)
  return JSON.parse(jsonLine) as Record<Kind, string[]>
}

const catalog = parseCatalog(await Bun.file(CATALOG_PATH).text())
if (catalog.length === 0) throw new Error(`Parsed zero rows from ${CATALOG_PATH} — is CATALOG's shape still \`{ kind: '...', id: '...' }\`?`)

const server = await serverIds()

let mismatches = 0
for (const kind of KINDS) {
  const catalogIds = new Set(catalog.filter((r) => r.kind === kind).map((r) => r.id))
  const serverIdSet = new Set(server[kind] ?? [])
  const extraInCatalog = [...catalogIds].filter((id) => !serverIdSet.has(id))
  const missingFromCatalog = [...serverIdSet].filter((id) => !catalogIds.has(id))
  if (extraInCatalog.length) {
    console.error(`${kind}: catalog.ts lists id(s) not registered on AgentOS: ${extraInCatalog.join(', ')}`)
    mismatches++
  }
  if (missingFromCatalog.length) {
    console.error(`${kind}: AgentOS registers id(s) missing from catalog.ts: ${missingFromCatalog.join(', ')}`)
    mismatches++
  }
}

if (mismatches > 0) {
  console.error(`\ncheck-demo-catalog: ${mismatches} mismatch(es) found between catalog.ts and server.py.`)
  process.exit(1)
}
console.log('check-demo-catalog: catalog.ts and server.py agree on every agent/team/workflow id.')
