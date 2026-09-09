import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { messageOf } from '../lib/format'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

interface Item { id: string; name: string; qty: number }
type Patch = Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>)

interface Props {
  /** Null while the session's session_state hasn't loaded yet — every control below is gated on this. */
  sessionState: Record<string, unknown> | null
  /** True while a run is active — the manual-edit lock this whole panel exists to demonstrate. */
  isBusy: boolean
  mergeSessionState: (patch: Patch) => Promise<void>
}

/** The `+`/`-`/add-item panel: every write goes through `mergeSessionState`, the exact same
 *  `session_state` the shopping agent's `add_item`/`remove_item` tools mutate from the chat column. */
export function ShoppingListPanel({ sessionState, isBusy, mergeSessionState }: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const disabled = sessionState === null || isBusy
  const reason = sessionState === null ? 'Loading…' : isBusy ? 'Agent is thinking — wait a moment.' : null
  const items = (sessionState?.items as Item[] | undefined) ?? []

  const runMerge = async (patch: Patch) => {
    setError(null)
    try {
      await mergeSessionState(patch)
    } catch (e) {
      setError(messageOf(e))
      setTimeout(() => setError(null), 4000)
    }
  }

  const changeQty = (item: Item, delta: number) =>
    void runMerge((current) => {
      const currentItems = (current.items as Item[] | undefined) ?? []
      return {
        // The array replaces wholesale on merge — no special "remove" API needed, just compute the
        // array we want (drop the item once its quantity would hit 0).
        items: currentItems
          .map((i) => (i.id === item.id ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
          .filter((i) => i.qty > 0),
      }
    })

  const addItem = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    void runMerge((current) => ({
      items: [...((current.items as Item[] | undefined) ?? []), { id: crypto.randomUUID(), name: trimmed, qty: 1 }],
    }))
    setName('')
  }

  return (
    <aside className="flex h-full min-w-0 flex-col overflow-y-auto border-l border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Shopping list</h2>
      <p className="mt-1 mb-3 text-xs text-neutral-400">
        session_state.items — edit it here, or ask the agent to.
      </p>
      {reason && <p className="mb-3 text-xs text-neutral-500">{reason}</p>}
      {items.length === 0 && sessionState !== null && <p className="mb-3 text-xs text-neutral-400">No items yet.</p>}
      <ul className="mb-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 px-2 py-1.5 text-sm">
            <span className="truncate">{item.name}</span>
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" className="px-2 py-0.5" disabled={disabled} onClick={() => changeQty(item, -1)}>−</Button>
              <span className="w-5 text-center tabular-nums">{item.qty}</span>
              <Button variant="secondary" className="px-2 py-0.5" disabled={disabled} onClick={() => changeQty(item, 1)}>+</Button>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={addItem} className="flex gap-2">
        <Input placeholder="Add item…" value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} />
        <Button type="submit" variant="secondary" disabled={disabled || !name.trim()}><Plus size={14} /></Button>
      </form>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </aside>
  )
}
