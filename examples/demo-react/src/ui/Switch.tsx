import { cn } from '../lib/cn'

export function Switch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-neutral-900' : 'bg-neutral-300')}
    >
      <span className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform', checked && 'translate-x-4')} />
    </button>
  )
}
