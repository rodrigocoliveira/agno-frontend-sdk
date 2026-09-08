import type { ReactNode } from 'react'

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="m-auto max-w-md p-8 text-center text-sm text-neutral-500">
      <p className="font-medium text-neutral-700">{title}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}
