import type { Kind } from '@rodrigocoliveira/agno-hooks'

export const GUIDE_URL = 'https://github.com/rodrigocoliveira/agno-frontend-sdk/blob/main/guide/'

export interface CatalogEntry { kind: Kind; id: string; try: string; shows: string; guide: string }

/** What each demo target demonstrates and which guide chapter explains it. Ids must match demo-agentos. */
export const CATALOG: CatalogEntry[] = [
  { kind: 'agent', id: 'chat', try: 'Summarise this PDF (attach one)', shows: 'Streaming, markdown, file attachments, cancel, metrics', guide: 'agent.md' },
  { kind: 'agent', id: 'tools', try: 'What is SKU-2? / Run the slow task', shows: 'Tool calls in the chat; reload the page while slow_task runs', guide: 'reconnection.md' },
  { kind: 'agent', id: 'browser', try: 'Where am I and what time is it?', shows: 'Tools executed in the browser (frontendTools)', guide: 'frontend-tools.md' },
  { kind: 'agent', id: 'confirm', try: 'Invoice ACME 120 dollars', shows: 'requires_confirmation, decided outside the chat', guide: 'confirmation-and-input.md' },
  { kind: 'agent', id: 'interview', try: 'Plan me a weekend', shows: 'ask_user with multi-select and a requires_user_input form', guide: 'confirmation-and-input.md' },
  { kind: 'agent', id: 'approval', try: 'Refund order 42, 30 dollars', shows: 'Admin approval: pauses until /approvals resolves it', guide: 'approvals.md' },
  { kind: 'team', id: 'support', try: 'Invoice ACME 50 dollars', shows: 'Member runs; a confirmation coming from a member', guide: 'team.md' },
  { kind: 'team', id: 'research', try: 'Electric bikes', shows: 'Parallel members, member_responses, ask_user on the leader', guide: 'team.md' },
  { kind: 'team', id: 'field', try: 'What is around me?', shows: 'A browser tool executed for a member', guide: 'frontend-tools.md' },
  { kind: 'workflow', id: 'publish', try: 'Edge computing', shows: 'Executor pause (question) then step pause (human review)', guide: 'workflow.md' },
  { kind: 'workflow', id: 'report', try: 'ACME Corp', shows: 'Parallel and Condition steps', guide: 'workflow.md' },
  { kind: 'workflow', id: 'nightly', try: 'go', shows: '45 s background run: close the tab and come back', guide: 'reconnection.md' },
]

export const pathFor = (kind: Kind, id: string) => `/${kind}s/${id}`
