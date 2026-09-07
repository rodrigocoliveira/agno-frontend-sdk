import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { provideUserInput } from '@rodrigocoliveira/agno-hooks'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'

export function UserInputForm({ tool, decided, onDecide }: { tool: ToolExecution; decided?: ToolExecution; onDecide: (t: ToolExecution) => void }) {
  const fields = tool.user_input_schema ?? []
  return (
    <Card>
      <form
        className="space-y-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          onDecide(provideUserInput(tool, Object.fromEntries(new FormData(e.currentTarget).entries())))
        }}
      >
        <div className="font-medium"><code className="font-mono">{tool.tool_name}</code> needs some details</div>
        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className="text-xs text-neutral-600">{f.description || f.name}</span>
            <Input name={f.name} defaultValue={String(f.value ?? '')} required />
          </label>
        ))}
        <Button type="submit" variant={decided ? 'primary' : 'secondary'}>{decided ? 'Saved ✓' : 'Save'}</Button>
      </form>
    </Card>
  )
}
