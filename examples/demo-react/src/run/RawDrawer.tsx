import type { Run } from '@rodrigocoliveira/agno-hooks'

export function RawDrawer({ run }: { run: Run }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-800">raw</summary>
      <pre className="mt-1 max-h-80 overflow-auto rounded bg-neutral-50 p-2">
        {JSON.stringify({ id: run.id, status: run.status, metrics: run.metrics, citations: run.citations, raw: run.raw }, null, 2)}
      </pre>
    </details>
  )
}
