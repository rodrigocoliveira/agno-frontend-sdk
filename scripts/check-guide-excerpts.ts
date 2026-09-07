#!/usr/bin/env bun
/**
 * Guards the guide's core promise: every source-attributed code excerpt under guide/** matches
 * its source file. Scans every fenced code block whose first line is a comment naming the file
 * it quotes (the convention used throughout the guide, e.g.
 * `// examples/demo-react/src/pages/AgentPage.tsx` or `# examples/demo-agentos/agents/chat.py`)
 * and checks that every non-comment, non-blank line of the block's body appears verbatim (as a
 * trimmed line) somewhere in the named file.
 *
 * A line-membership check, not full AST diffing — sufficient to catch drift after a refactor.
 * Run from the repo root: `bun run scripts/check-guide-excerpts.ts`.
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const GUIDE_DIR = 'guide'

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await findMarkdownFiles(p)))
    else if (entry.name.endsWith('.md')) out.push(p)
  }
  return out.sort()
}

// A fenced block's first line naming the file it quotes, e.g. `// examples/x/y.ts` or `# a/b.py`.
const HEADER_RE = /^(?:\/\/|#)\s*([\w./-]+\/[\w.-]+)\s*$/

function isCommentOrBlank(line: string): boolean {
  const t = line.trim()
  return t === '' || t.startsWith('//') || t.startsWith('#') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('"""')
}

interface Block { startLine: number; sourcePath: string; bodyLines: string[] }

function extractBlocks(content: string): Block[] {
  const lines = content.split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    if (/^```/.test(lines[i]!.trim())) {
      const fenceLine = i
      const body: string[] = []
      i++
      while (i < lines.length && lines[i]!.trim() !== '```') { body.push(lines[i]!); i++ }
      i++ // skip closing fence (or EOF if unterminated)
      const first = body[0]
      const match = first !== undefined ? HEADER_RE.exec(first.trim()) : null
      if (match) blocks.push({ startLine: fenceLine + 1, sourcePath: match[1]!, bodyLines: body.slice(1) })
      continue
    }
    i++
  }
  return blocks
}

const sourceLineCache = new Map<string, Set<string> | null>()

async function trimmedLinesOf(path: string): Promise<Set<string> | null> {
  if (sourceLineCache.has(path)) return sourceLineCache.get(path)!
  const file = Bun.file(path)
  if (!(await file.exists())) { sourceLineCache.set(path, null); return null }
  const set = new Set((await file.text()).split('\n').map((l) => l.trim()))
  sourceLineCache.set(path, set)
  return set
}

let mismatches = 0

for (const mdPath of await findMarkdownFiles(GUIDE_DIR)) {
  const content = await Bun.file(mdPath).text()
  for (const block of extractBlocks(content)) {
    const sourceLines = await trimmedLinesOf(block.sourcePath)
    if (!sourceLines) {
      console.error(`${mdPath}:${block.startLine}: excerpt names a source file that does not exist: ${block.sourcePath}`)
      mismatches++
      continue
    }
    block.bodyLines.forEach((raw, idx) => {
      if (isCommentOrBlank(raw)) return
      const trimmed = raw.trim()
      if (!sourceLines.has(trimmed)) {
        console.error(`${mdPath}:${block.startLine + 2 + idx}: line not found verbatim in ${block.sourcePath}:\n    ${raw}`)
        mismatches++
      }
    })
  }
}

if (mismatches > 0) {
  console.error(`\ncheck-guide-excerpts: ${mismatches} mismatch(es) found.`)
  process.exit(1)
}
console.log('check-guide-excerpts: every guide code excerpt matches its source file.')
