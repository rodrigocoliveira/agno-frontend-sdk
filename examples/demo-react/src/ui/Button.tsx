import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
const styles: Record<Variant, string> = {
  primary: 'bg-neutral-900 text-white hover:bg-neutral-700',
  secondary: 'border border-neutral-300 bg-white hover:bg-neutral-100',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  ghost: 'hover:bg-neutral-100',
}

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className)}
      {...props}
    />
  )
}
