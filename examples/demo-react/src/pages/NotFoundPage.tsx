import { Link } from 'react-router'
import { Empty } from '../ui/Empty'

export function NotFoundPage() {
  return <Empty title="Nothing here"><Link className="underline" to="/">Back to home</Link></Empty>
}
