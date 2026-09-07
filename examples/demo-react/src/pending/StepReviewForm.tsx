import type { StepRequirement } from '@rodrigocoliveira/agno-api'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'

/** A workflow step pause (HumanReview): confirmation or a small input form. Returns the decided StepRequirement. */
export function StepReviewForm({ requirement, onSubmit }: { requirement: StepRequirement; onSubmit: (r: StepRequirement) => void }) {
  if (requirement.requires_user_input) {
    const fields = requirement.user_input_schema ?? []
    return (
      <Card>
        <form className="space-y-2 text-sm" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...requirement, user_input: Object.fromEntries(new FormData(e.currentTarget).entries()) }) }}>
          <div className="font-medium">{requirement.user_input_message ?? `Step "${requirement.step_name}" needs input`}</div>
          {fields.map((f) => <label key={f.name} className="block"><span className="text-xs text-neutral-600">{f.description || f.name}</span><Input name={f.name} required /></label>)}
          <Button type="submit">Send</Button>
        </form>
      </Card>
    )
  }
  return (
    <Card className="flex items-center gap-3 text-sm">
      <div className="flex-1">{requirement.confirmation_message ?? `Run step "${requirement.step_name}"?`}</div>
      <Button onClick={() => onSubmit({ ...requirement, confirmed: true })}>Approve</Button>
      <Button variant="danger" onClick={() => onSubmit({ ...requirement, confirmed: false })}>Reject</Button>
    </Card>
  )
}
