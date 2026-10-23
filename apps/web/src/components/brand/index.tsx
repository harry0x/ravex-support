import { useEffect, useId, useState, type ReactNode } from 'react'
import { RAVEN_PATH, RAVEN_VIEWBOX } from './ravenPath'

type Tone = 'ink' | 'paper' | 'plum'

/** The official Ravex raven. `plum` uses the gradient of the Ravex site's 3D raven. */
export function RavenMark({ tone = 'ink', className, title }: { tone?: Tone; className?: string; title?: string }) {
  const id = useId()
  const fill = tone === 'ink' ? 'var(--color-ink)' : tone === 'paper' ? 'var(--color-paper)' : `url(#${id})`
  return (
    <svg viewBox={RAVEN_VIEWBOX} className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {tone === 'plum' && <RavenGradient id={id} />}
      <path d={RAVEN_PATH} fill={fill} fillRule="evenodd" />
    </svg>
  )
}

function RavenGradient({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0.1" y1="0" x2="0.75" y2="1">
        <stop offset="0" stopColor="var(--color-plum-400)" />
        <stop offset="0.3" stopColor="var(--color-plum-600)" />
        <stop offset="0.65" stopColor="var(--color-plum-800)" />
        <stop offset="1" stopColor="#0c0408" />
      </linearGradient>
    </defs>
  )
}

/** Wordmark: raven + uppercase "RAVEX" with a mono "/support" suffix. */
export function Wordmark({ tone = 'ink', compact = false }: { tone?: 'ink' | 'paper'; compact?: boolean }) {
  const text = tone === 'paper' ? 'text-paper' : 'text-ink'
  return (
    <span className="inline-flex items-center gap-2.5">
      <RavenMark tone={tone} className="h-[22px] w-auto" />
      {!compact && (
        <span className={`flex items-baseline gap-1 ${text}`}>
          <span className="text-[17px] font-semibold tracking-[-0.03em]">RAVEX</span>
          <span className="font-mono text-[11px] text-mute">/support</span>
        </span>
      )}
    </span>
  )
}

const CELL = 40

/** The Ravex site's backdrop: a 40px grid under a radial fade, with random cells flickering. */
export function GridBackdrop({ tone = 'light', cells = 16, className = '' }: { tone?: 'light' | 'dark'; cells?: number; className?: string }) {
  const id = useId()
  const line = tone === 'dark' ? 'rgba(250,252,252,0.07)' : 'var(--grid-line)'
  const fill = tone === 'dark' ? 'var(--color-plum-400)' : 'var(--color-ink)'
  const [flicker, setFlicker] = useState<{ x: number; y: number; delay: number; opacity: number }[]>([])

  useEffect(() => {
    const shuffle = () =>
      setFlicker(
        Array.from({ length: cells }, () => ({
          x: Math.floor(Math.random() * 40),
          y: Math.floor(Math.random() * 26),
          delay: Math.random() * 4,
          opacity: tone === 'dark' ? 0.18 + Math.random() * 0.25 : 0.04 + Math.random() * 0.08,
        })),
      )
    shuffle()
    const t = setInterval(shuffle, 8000)
    return () => clearInterval(t)
  }, [cells, tone])

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden mask-radial ${className}`}>
      <svg className="h-full w-full">
        <defs>
          <pattern id={id} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <path d={`M.5 ${CELL}V.5H${CELL}`} fill="none" stroke={line} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
        {flicker.map((c, i) => (
          <rect
            key={`${c.x}-${c.y}-${i}`}
            x={c.x * CELL + 1}
            y={c.y * CELL + 1}
            width={CELL - 1}
            height={CELL - 1}
            fill={fill}
            style={{ animation: `cell-flash 4s ease-in-out ${c.delay}s infinite`, ['--cell-opacity' as string]: c.opacity, opacity: 0 }}
          />
        ))}
      </svg>
    </div>
  )
}

/** Infinite feature ticker with ◆ separators, as on the Ravex site. */
export function Marquee({ items, className = '' }: { items: string[]; className?: string }) {
  const row = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <span key={item} className="flex items-center">
          <span className="whitespace-nowrap px-7">{item}</span>
          <span className="text-[0.55em] opacity-40">◆</span>
        </span>
      ))}
    </div>
  )
  return (
    <div className={`flex overflow-hidden mask-fade-x ${className}`}>
      <div className="flex animate-marquee">
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}

/** Mono measurement label, e.g. `D = 50,0` (after Reading Stones' diagrams). */
export function Annotation({ k, v, className = '' }: { k: string; v: ReactNode; className?: string }) {
  return (
    <span className={`annot whitespace-nowrap ${className}`}>
      {k} <span className="opacity-60">=</span> <span className="text-graphite">{v}</span>
    </span>
  )
}

/** Mono section label: "01 / Queue". */
export function SectionLabel({ index, children, tone = 'ink' }: { index?: number; children: ReactNode; tone?: 'ink' | 'paper' }) {
  return (
    <span className={`annot ${tone === 'paper' ? 'text-paper/55!' : ''}`}>
      {index !== undefined && <span className={tone === 'paper' ? 'text-plum-300' : 'text-plum-500'}>{String(index).padStart(2, '0')} / </span>}
      {children}
    </span>
  )
}

/** A dimension line: hairline with arrowheads, optional centred label. */
export function Ruler({ label, className = '', tone = 'ink' }: { label?: ReactNode; className?: string; tone?: 'ink' | 'paper' }) {
  const color = tone === 'paper' ? 'text-paper/35' : 'text-line-strong'
  const line = (dir: 'l' | 'r') => (
    <span className={`relative h-px flex-1 bg-current ${color}`}>
      <span
        className={`absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-current ${color} ${dir === 'l' ? 'left-0 border-b border-l' : 'right-0 border-r border-t'}`}
      />
    </span>
  )
  return (
    <div className={`flex items-center gap-3 ${className}`} role="separator">
      {line('l')}
      {label !== undefined && <span className="annot min-w-0 max-w-[75%] text-center">{label}</span>}
      {line('r')}
    </div>
  )
}

const BRAILLE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** Braille spinner (a nod to Reading Stones' braille glyphs). */
export function BrailleSpinner({ className = '' }: { className?: string }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % BRAILLE.length), 90)
    return () => clearInterval(t)
  }, [])
  return (
    <span aria-hidden className={`inline-block w-[1ch] font-mono ${className}`}>
      {BRAILLE[i]}
    </span>
  )
}

/**
 * The raven as an annotated technical drawing: callout lines point at the eye, beak, crown and
 * wing, each labelled with a realtime feature Ravex provides.
 */
export function RavenDiagram({ className = '' }: { className?: string }) {
  const id = useId()
  type Point = [number, number]
  const callouts: { from: Point; elbow: Point; end: Point; label: string; sub: string; anchor: 'start' | 'end' }[] = [
    { from: [452, 368], elbow: [150, 250], end: [-190, 250], label: '01 · Presence', sub: 'online · away · offline', anchor: 'start' },
    { from: [958, 546], elbow: [1070, 650], end: [1250, 650], label: '02 · Typing', sub: 'throttled · auto-stop 3s', anchor: 'end' },
    { from: [600, 213], elbow: [690, 95], end: [1050, 95], label: '03 · Read receipts', sub: 'persisted in postgres', anchor: 'end' },
    { from: [395, 812], elbow: [300, 890], end: [-120, 890], label: '04 · Reactions', sub: '👍 ❤️ 😂 😮 😢', anchor: 'start' },
  ]
  return (
    <svg viewBox="-230 40 1520 920" className={className} aria-hidden>
      <RavenGradient id={id} />
      {/* construction lines */}
      <line x1="500" y1="60" x2="500" y2="940" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="6 8" />
      <line x1="-200" y1="500" x2="1260" y2="500" stroke="currentColor" strokeOpacity="0.12" strokeDasharray="2 10" />
      <circle cx="500" cy="490" r="410" fill="none" stroke="currentColor" strokeOpacity="0.08" />
      <circle cx="500" cy="490" r="300" fill="none" stroke="currentColor" strokeOpacity="0.06" />
      {/* The raven and its callouts float together so the anchor dots stay on the drawing. */}
      <g className="animate-float" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
      <path d={RAVEN_PATH} fill={`url(#${id})`} fillRule="evenodd" />
      {/* lens on the eye */}
      <circle cx="452" cy="368" r="46" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" />
      {callouts.map((c, i) => {
        const d = `M${c.from[0]} ${c.from[1]} L${c.elbow[0]} ${c.elbow[1]} L${c.end[0]} ${c.end[1]}`
        return (
          <g key={c.label} style={{ animationDelay: `${0.3 + i * 0.25}s` }} className="animate-rise">
            <path d={d} fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="1200" className="animate-draw" style={{ ['--len' as string]: 1200, animationDelay: `${0.3 + i * 0.25}s` }} />
            <circle cx={c.from[0]} cy={c.from[1]} r="7" fill="var(--color-paper)" stroke="currentColor" strokeWidth="2" />
            <text x={c.end[0]} y={c.end[1] - 16} textAnchor={c.anchor} fill="currentColor" style={{ font: '500 30px var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {c.label}
            </text>
            <text x={c.end[0]} y={c.end[1] + 38} textAnchor={c.anchor} fill="currentColor" fillOpacity="0.5" style={{ font: '24px var(--font-mono)' }}>
              {c.sub}
            </text>
          </g>
        )
      })}
      </g>
      <text x="-200" y="80" fill="currentColor" fillOpacity="0.45" style={{ font: '22px var(--font-mono)' }}>D = 952 × 700</text>
      <text x="1250" y="940" textAnchor="end" fill="currentColor" fillOpacity="0.45" style={{ font: '22px var(--font-mono)' }}>V = 0.1.1</text>
    </svg>
  )
}
