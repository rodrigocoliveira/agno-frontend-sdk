import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'
const tones: Record<Tone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-block rounded px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide', tones[tone], className)}>{children}</span>
}
