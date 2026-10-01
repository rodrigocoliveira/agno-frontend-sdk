import { Paperclip, Send, Square } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { cn } from '../lib/cn'
import { messageOf } from '../lib/format'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'

interface Props {
  busy: boolean
  allowFiles: boolean
  placeholder: string
  onSend: (message: string, files: File[], background: boolean) => Promise<void>
  onCancel: () => void
}

export function Composer({ busy, allowFiles, placeholder, onSend, onCancel }: Props) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [background, setBackground] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || busy) return
    setError(null)
    try {
      await onSend(text, files, background)
      setText(''); setFiles([])
    } catch (err) { setError(messageOf(err)) }
  }

  return (
    <form onSubmit={submit} className="border-t border-neutral-200 bg-white p-3">
      {files.length > 0 && <div className="mb-2 text-xs text-neutral-500">{files.map((f) => f.name).join(', ')}</div>}
      <div className="flex items-end gap-2">
        {allowFiles && (
          <>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <Button type="button" variant="ghost" onClick={() => fileInput.current?.click()} title="Attach files"><Paperclip size={16} /></Button>
          </>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={background}
          onClick={() => setBackground((b) => !b)}
          title={background ? 'Run survives a disconnect (click to run in the foreground)' : 'Run ends if you disconnect (click to run in the background)'}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition',
            background ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-100',
          )}
        >
          <span className={cn('relative h-4 w-7 rounded-full transition-colors', background ? 'bg-emerald-500' : 'bg-neutral-300')}>
            <span className={cn('absolute top-0.5 size-3 rounded-full bg-white shadow transition-all', background ? 'left-3.5' : 'left-0.5')} />
          </span>
          Background {background ? 'on' : 'off'}
        </button>
        <Textarea
          rows={2}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) void submit(e) }}
        />
        {busy
          ? <Button type="button" variant="danger" onClick={onCancel} title="Cancel the run"><Square size={16} /></Button>
          : <Button type="submit" disabled={!text.trim()} title="Send"><Send size={16} /></Button>}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </form>
  )
}
