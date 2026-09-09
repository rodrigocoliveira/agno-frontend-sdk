import { Paperclip, Send, Square } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
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
        <Button
          type="button"
          variant={background ? 'secondary' : 'ghost'}
          onClick={() => setBackground((b) => !b)}
          title={background ? 'Run survives a disconnect (click to run in the foreground)' : 'Run ends if you disconnect (click to run in the background)'}
          aria-pressed={background}
        >
          Background
        </Button>
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
