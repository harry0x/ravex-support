import { twMerge } from 'tailwind-merge'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { initials } from '../../lib/format'
import { useTheme, type ThemeChoice } from '../../lib/theme'
import type { ConversationStatus, Presence, Priority } from '../../types/api'
import { BrailleSpinner, RavenMark, SectionLabel } from '../brand'

/** Joins classes; later Tailwind utilities override earlier conflicting ones (e.g. a width passed via className). */
export const cx = (...classes: (string | false | null | undefined)[]) => twMerge(classes.filter(Boolean).join(' '))

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'plum'

const BUTTON: Record<ButtonVariant, string> = {
  primary: 'btn-press bg-ink text-paper hover:bg-ink-3 disabled:bg-paper-3 disabled:text-mute',
  plum: 'btn-press bg-plum-500 text-white [--ledge:var(--color-plum-800)] hover:bg-plum-600 disabled:opacity-50',
  secondary:
    'btn-press border-[1.5px] border-ink bg-surface text-ink [--ledge:var(--color-ink)] hover:bg-paper-2 disabled:border-line-strong disabled:text-mute',
  danger: 'btn-press bg-danger text-white [--ledge:#7c2d12] hover:brightness-110 disabled:opacity-50',
  ghost: 'text-graphite hover:bg-paper-2 hover:text-ink disabled:text-line-strong',
}

/** Tactile pill buttons (after Bato): they sit on a ledge and press down when clicked. */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-full font-medium tracking-tight disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3.5 py-1.5 text-xs' : 'px-5 py-2.5 text-sm',
        BUTTON[variant],
        className,
      )}
    />
  )
}

const FIELD =
  'w-full rounded-xl border border-transparent bg-paper-2 px-3.5 py-2.5 text-sm text-ink outline-none transition-[border-color,background-color,box-shadow] placeholder:text-mute hover:border-line-strong focus:border-ink focus:bg-surface focus:shadow-[0_0_0_4px_var(--color-plum-100)] disabled:text-mute disabled:hover:border-transparent'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(FIELD, className)} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(FIELD, 'resize-none', className)} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(FIELD, 'cursor-pointer pr-8', className)} />
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="block font-mono text-[10.5px] uppercase tracking-[0.1em] text-graphite">{label}</span>
      {children}
      {hint && <span className="block text-xs text-mute">{hint}</span>}
    </label>
  )
}

/** Gallery panel: white, hairline, square corners. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('border border-line bg-surface', className)}>{children}</div>
}

/** Panel heading: numbered mono label with an optional action on the right. */
export function CardHeader({ index, title, action }: { index?: number; title: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-5 py-3">
      <SectionLabel index={index}>{title}</SectionLabel>
      {action}
    </div>
  )
}

/**
 * Gallery-style page header (after Atelier Meridien): a huge, tightly tracked title with an
 * optional grey continuation, mono annotations above.
 */
export function PageHeader({
  title,
  aside,
  description,
  actions,
  eyebrow,
}: {
  title: string
  aside?: ReactNode
  description?: string
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <header className="mb-10 animate-rise">
      {eyebrow && <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1">{eyebrow}</div>}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h1 className="text-[clamp(2.5rem,6vw,4.75rem)] font-medium leading-[0.95] tracking-display text-ink">
          {title}
          {aside && <span className="block text-mute">{aside}</span>}
        </h1>
        {actions && <div className="flex flex-wrap gap-3 pb-1">{actions}</div>}
      </div>
      {description && <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-graphite">{description}</p>}
    </header>
  )
}

/** A big number with a mono label, for dashboards. */
export function Metric({ label, value, hint, accent = false }: { label: string; value: number | string | undefined; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className="relative bg-surface p-5">
      <p className="annot">{label}</p>
      <p className={cx('mt-3 text-5xl font-medium tabular-nums tracking-display', accent ? 'text-plum-500' : 'text-ink')}>
        {typeof value === 'number' ? value.toLocaleString() : (value ?? '–')}
      </p>
      {hint && <p className="mt-2 text-xs text-mute">{hint}</p>}
    </div>
  )
}

/** Hairline grid of metrics (gap-px over a line-coloured background draws the rules). */
export function MetricGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('grid grid-cols-1 gap-px border border-line bg-line', className)}>{children}</div>
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-plum-500" role="status">
      <BrailleSpinner className="text-base" />
      <span className="annot">{label}</span>
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <RavenMark className="h-9 w-auto opacity-[0.12]" />
      <p className="text-lg font-medium tracking-tight text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-graphite">{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-4 flex items-center justify-between gap-3 border border-danger/30 bg-surface px-4 py-3 text-sm text-ink" role="alert">
      <span>
        <span className="annot mr-2 text-danger!">Error</span>
        {message}
      </span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'success' }) {
  const tones = { error: 'border-danger', info: 'border-plum-500', success: 'border-signal' }
  return <div className={cx('border-l-2 bg-paper-2 px-3 py-2 text-sm text-ink', tones[tone])}>{children}</div>
}

const PRESENCE_COLOR: Record<Presence, string> = {
  online: 'bg-signal live-pulse',
  away: 'bg-caution',
  busy: 'bg-danger',
  offline: 'bg-line-strong',
}

export function PresenceDot({ presence, className }: { presence: Presence; className?: string }) {
  return <span className={cx('inline-block h-2.5 w-2.5 rounded-full ring-2 ring-surface', PRESENCE_COLOR[presence], className)} title={presence} />
}

const AVATAR_TINTS = ['bg-ink text-paper', 'bg-plum-500 text-white', 'bg-paper-3 text-ink'] as const

/** Lens-like round avatar with mono initials, tinted by name. */
export function Avatar({ name, presence, size = 'md' }: { name: string; presence?: Presence; size?: 'sm' | 'md' | 'lg' }) {
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const sizes = { sm: 'h-7 w-7 text-[10px]', md: 'h-10 w-10 text-[11px]', lg: 'h-14 w-14 text-sm' }
  return (
    <span className="relative inline-flex shrink-0">
      <span className={cx('inline-flex items-center justify-center rounded-full font-mono font-semibold tracking-tight', AVATAR_TINTS[hash % 3], sizes[size])}>
        {initials(name) || '?'}
      </span>
      {presence && <PresenceDot presence={presence} className="absolute -bottom-0 -right-0" />}
    </span>
  )
}

type BadgeTone = 'slate' | 'green' | 'amber' | 'red' | 'indigo' | 'sky' | 'plum' | 'ink'

export function Badge({ children, tone = 'slate', dot = false }: { children: ReactNode; tone?: BadgeTone; dot?: boolean }) {
  const tones: Record<BadgeTone, string> = {
    slate: 'border-line-strong text-graphite',
    green: 'border-signal/35 text-signal',
    amber: 'border-caution/35 text-caution',
    red: 'border-danger/35 text-danger',
    indigo: 'border-plum-300 text-plum-600',
    sky: 'border-plum-200 text-plum-500',
    plum: 'border-plum-200 bg-plum-50 text-plum-700',
    ink: 'border-ink bg-ink text-paper',
  }
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border bg-surface px-2 py-[3px] font-mono text-[10px] font-medium uppercase leading-none tracking-[0.06em]', tones[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: ConversationStatus }) {
  const tone = status === 'OPEN' ? 'green' : status === 'PENDING' ? 'amber' : 'slate'
  return (
    <Badge tone={tone} dot>
      {status.toLowerCase()}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'NORMAL') return null
  const tone = priority === 'URGENT' ? 'red' : priority === 'HIGH' ? 'amber' : 'slate'
  return <Badge tone={tone}>{priority === 'URGENT' ? '▲ urgent' : priority.toLowerCase()}</Badge>
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3.5">
      <span className="annot">
        Page {String(page).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
      </span>
      <div className="flex gap-3">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Prev
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next →
        </Button>
      </div>
    </div>
  )
}

/** Underlined tab strip, like the Ravex site's install tabs. */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex gap-6 overflow-x-auto" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            '-mb-px whitespace-nowrap border-b-2 pb-2.5 pt-3 text-sm transition-colors',
            value === o.value ? 'border-ink font-medium text-ink' : 'border-transparent text-mute hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const THEME_OPTIONS: { value: ThemeChoice; label: string; glyph: string }[] = [
  { value: 'system', label: 'System theme', glyph: '◐' },
  { value: 'light', label: 'Light theme', glyph: '☀' },
  { value: 'dark', label: 'Dark theme', glyph: '☾' },
]

/** Three-way theme switch: follow the OS, or pin light / dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme()
  return (
    <div role="radiogroup" aria-label="Theme" className={cx('inline-flex items-center rounded-full border border-line bg-surface p-0.5', className)}>
      {THEME_OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={theme === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => setTheme(o.value)}
          className={cx(
            'flex h-7 w-7 items-center justify-center rounded-full text-[13px] leading-none transition-colors',
            theme === o.value ? 'bg-ink text-paper' : 'text-mute hover:text-ink',
          )}
        >
          {o.glyph}
        </button>
      ))}
    </div>
  )
}
