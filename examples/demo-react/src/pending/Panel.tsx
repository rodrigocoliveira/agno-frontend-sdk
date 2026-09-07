import type { ReactNode } from 'react'

export function Panel({ title, error, children }: { title: string; error: string | null; children: ReactNode }) {
  return (
    <div className="space-y-3 border-b border-amber-200 bg-amber-50 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">{title}</div>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
