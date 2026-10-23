import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BrailleSpinner, Ruler } from '../brand'
import { Avatar, Badge, cx } from '../ui'

/**
 * A scripted, looping product demo ("video") rendered with the app's own components: the same
 * conversation seen from the customer's and the agent's side. Deterministic timeline, seekable
 * chapters, play/pause, and it starts paused for people who prefer reduced motion.
 */

const DURATION = 18_000

const CHAPTERS = [
  { at: 0, label: 'Customer opens a conversation' },
  { at: 3200, label: 'Agent accepts from the live queue' },
  { at: 5600, label: 'Typing, then a live reply' },
  { at: 9000, label: 'Read receipt' },
  { at: 11_200, label: 'Emoji reaction' },
  { at: 13_600, label: 'Resolved and closed' },
] as const

const T = {
  customerTyping: 300,
  customerSent: 1700,
  queueCard: 2000,
  acceptPress: 3400,
  joined: 3900,
  agentTyping: 5800,
  agentSent: 8000,
  read: 9500,
  reaction: 11_800,
  closed: 14_200,
}

const CUSTOMER_TEXT = 'Hi! I was charged twice for October.'
const AGENT_TEXT = 'I see both charges on the 3rd. The duplicate is reversed, so it lands back in 3–5 days.'

function useReelClock() {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [t, setT] = useState(reduced ? T.closed + 600 : 0)
  const [playing, setPlaying] = useState(!reduced)
  const [visible, setVisible] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  // Only run while on screen.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!playing || !visible) return
    let last = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      setT((prev) => (prev + (now - last)) % DURATION)
      last = now
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [playing, visible])

  return { t, setT, playing, setPlaying, ref }
}

const fmt = (ms: number) => `00:${String(Math.floor(ms / 1000)).padStart(2, '0')}`

function Pane({ title, subtitle, presence, children, footer }: { title: string; subtitle: ReactNode; presence?: 'online' | 'offline'; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden border border-line bg-paper">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </div>
        <span className="annot">{title}</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-graphite">
          {presence && <span className={cx('h-2 w-2 rounded-full', presence === 'online' ? 'bg-signal live-pulse' : 'bg-line-strong')} />}
          {subtitle}
        </span>
      </div>
      <div className="bg-dots flex min-h-[260px] flex-1 flex-col justify-end gap-3 overflow-hidden px-4 py-4 sm:min-h-[300px]">{children}</div>
      {footer}
    </div>
  )
}

function Bubble({ mine, children, meta, reaction }: { mine?: boolean; children: ReactNode; meta?: ReactNode; reaction?: boolean }) {
  return (
    <div className={cx('flex animate-rise flex-col', mine ? 'items-end' : 'items-start')}>
      {mine ? (
        <div className="facet-br max-w-[85%] bg-ink px-3.5 py-2 text-sm text-paper">{children}</div>
      ) : (
        <div className="facet-outline max-w-[85%]">
          <div className="facet-bl bg-surface px-3.5 py-2 text-sm text-ink">{children}</div>
        </div>
      )}
      {reaction && <span className="mt-1 animate-rise rounded-full border border-plum-300 bg-plum-50 px-2 py-0.5 font-mono text-[11px] text-plum-700">❤️ 1</span>}
      {meta && <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-mute">{meta}</span>}
    </div>
  )
}

function Typing({ name }: { name: string }) {
  return (
    <div className="flex animate-rise items-center gap-2 font-mono text-[11px] text-graphite">
      <BrailleSpinner className="text-plum-500" />
      {name} is typing…
    </div>
  )
}

function Composer({ text, cursor }: { text: string; cursor: boolean }) {
  return (
    <div className="border-t border-line bg-paper p-3">
      <div className="flex items-center gap-2 rounded-full border border-line-strong bg-surface py-1.5 pl-4 pr-1.5">
        <span className={cx('flex-1 truncate text-sm', text ? 'text-ink' : 'text-mute')}>
          {text || 'Type a message…'}
          {cursor && <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-ink align-middle" />}
        </span>
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper">Send ↵</span>
      </div>
    </div>
  )
}

export function DemoReel() {
  const { t, setT, playing, setPlaying, ref } = useReelClock()
  const after = (ms: number) => t >= ms
  const chapter = CHAPTERS.reduce((current, c, i) => (t >= c.at ? i : current), 0)

  const typed = after(T.customerSent)
    ? ''
    : CUSTOMER_TEXT.slice(0, Math.max(0, Math.floor(((t - T.customerTyping) / (T.customerSent - 200 - T.customerTyping)) * CUSTOMER_TEXT.length)))
  const assigned = after(T.acceptPress + 300)
  const closed = after(T.closed)
  const status = closed ? <Badge tone="slate" dot>closed</Badge> : <Badge tone="green" dot>open</Badge>

  return (
    <div ref={ref} className="w-full">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Customer side */}
        <Pane title="Customer · Jordan" subtitle={assigned ? 'Maya · online' : 'Waiting for an agent'} presence={assigned ? 'online' : undefined} footer={<Composer text={typed} cursor={!after(T.customerSent) && after(T.customerTyping)} />}>
          {after(T.customerSent) && <Bubble mine meta={after(T.agentTyping) ? <span className="text-plum-500">01:46 · Read</span> : '01:46 · Sent'}>{CUSTOMER_TEXT}</Bubble>}
          {after(T.joined) && <Ruler className="animate-rise" label="Maya Chen joined the conversation" />}
          {after(T.agentTyping) && !after(T.agentSent) && <Typing name="Maya Chen" />}
          {after(T.agentSent) && (
            <Bubble meta="01:47" reaction={after(T.reaction)}>
              {AGENT_TEXT}
            </Bubble>
          )}
          {closed && <Ruler className="animate-rise" label="Jordan Lee closed the conversation" />}
          <div className="flex items-center gap-2">{status}</div>
        </Pane>

        {/* Agent side */}
        <Pane title="Agent · Maya" subtitle="Jordan · online" presence="online">
          {after(T.queueCard) && !after(T.joined) && (
            <div className="animate-rise border border-line bg-surface p-3">
              <div className="flex items-center gap-3">
                <Avatar name="Jordan Lee" size="sm" presence="online" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">Invoice charged twice</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-mute">Jordan Lee / Billing · waiting just now</p>
                </div>
                <span
                  className={cx(
                    'rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper transition-transform',
                    after(T.acceptPress) ? 'translate-y-[3px] shadow-[0_1px_0_0_var(--color-plum-700)]' : 'shadow-[0_4px_0_0_var(--color-plum-700)]',
                  )}
                >
                  Accept
                </span>
              </div>
            </div>
          )}
          {after(T.joined) && (
            <>
              <Bubble>{CUSTOMER_TEXT}</Bubble>
              <Ruler className="animate-rise" label="Maya Chen joined the conversation" />
            </>
          )}
          {after(T.agentSent) && (
            <Bubble mine meta={after(T.read) ? <span className="text-plum-500">01:47 · Read</span> : '01:47 · Sent'} reaction={after(T.reaction)}>
              {AGENT_TEXT}
            </Bubble>
          )}
          {closed && <Ruler className="animate-rise" label="Jordan Lee closed the conversation" />}
          {after(T.joined) && <div className="flex items-center gap-2">{status}</div>}
        </Pane>
      </div>

      {/* Video-style controls */}
      <div className="mt-4 border border-line bg-surface p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause demo' : 'Play demo'}
            className="btn-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm text-paper"
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium text-ink">
                <span className="mr-2 font-mono text-[11px] text-plum-500">{String(chapter + 1).padStart(2, '0')}</span>
                {CHAPTERS[chapter]?.label}
              </p>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-mute">
                {fmt(t)} / {fmt(DURATION)}
              </span>
            </div>
            <div className="relative mt-2 h-1 w-full bg-line" aria-hidden>
              <div className="absolute inset-y-0 left-0 bg-plum-500" style={{ width: `${(t / DURATION) * 100}%` }} />
            </div>
          </div>
        </div>
        <ol className="mt-3 hidden grid-cols-6 gap-2 md:grid">
          {CHAPTERS.map((c, i) => (
            <li key={c.label}>
              <button
                onClick={() => setT(c.at + 1)}
                className={cx('w-full border-t-2 pt-2 text-left text-xs transition-colors', i === chapter ? 'border-plum-500 text-ink' : 'border-line text-mute hover:text-ink')}
              >
                <span className="font-mono text-[10px]">{String(i + 1).padStart(2, '0')}</span> {c.label}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
