import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Annotation, GridBackdrop, Marquee, RavenDiagram, RavenMark, Ruler, SectionLabel, Wordmark } from '../../components/brand'
import { DemoReel } from '../../components/landing/DemoReel'
import { ThemeToggle, cx } from '../../components/ui'
import { useIsDark } from '../../lib/theme'

/** Fades sections in as they scroll into view (instantly under reduced motion). */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={cx('transition-[opacity,transform] duration-700 ease-out', shown ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0', className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

function SectionHead({ index, eyebrow, title, aside, children }: { index: number; eyebrow: string; title: string; aside?: string; children?: ReactNode }) {
  return (
    <Reveal className="mb-12 max-w-3xl">
      <SectionLabel index={index}>{eyebrow}</SectionLabel>
      <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] font-medium leading-[0.95] tracking-display text-ink">
        {title}
        {aside && <span className="block text-mute">{aside}</span>}
      </h2>
      {children && <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-graphite">{children}</p>}
    </Reveal>
  )
}

const NAV = [
  { href: '#demo', label: 'Demo' },
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#portals', label: 'Portals' },
]

function TopBar() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header className={cx('sticky top-0 z-40 transition-colors', scrolled ? 'border-b border-line bg-paper/85 backdrop-blur' : 'border-b border-transparent')}>
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-3.5 sm:px-8">
        <Link to="/" aria-label="Ravex Support home">
          <Wordmark />
        </Link>
        <nav className="mx-auto hidden items-center gap-1 rounded-full bg-ink p-1.5 md:flex" aria-label="Sections">
          {NAV.map((item, i) => (
            <a key={item.href} href={item.href} className="flex items-baseline gap-1.5 rounded-full px-4 py-1.5 text-sm text-paper/65 transition-colors hover:bg-paper hover:text-ink">
              <span className="font-mono text-[9.5px] opacity-50">{String(i + 1).padStart(2, '0')}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Link to="/login" className="hidden font-mono text-[11px] uppercase tracking-[0.1em] text-graphite hover:text-ink sm:inline">
            Sign in
          </Link>
          <Link to="/register" className="btn-press rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-3">
            Get started
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="px-3 sm:px-5">
      <div className="keep-light relative mx-auto max-w-[1400px] overflow-hidden rounded-[28px] bg-ink text-paper ring-1 ring-paper/10">
        <GridBackdrop tone="dark" cells={22} />
        <div className="relative grid grid-cols-1 items-center gap-6 px-6 pb-6 pt-12 sm:px-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-0 lg:pb-12">
          <div className="animate-rise">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <Annotation k="Transport" v={<span className="text-paper/80">WebSocket · Ravex</span>} className="text-paper/45!" />
              <Annotation k="Store" v={<span className="text-paper/80">PostgreSQL</span>} className="text-paper/45!" />
            </div>
            <h1 className="mt-6 text-[clamp(2.9rem,7vw,6.25rem)] font-medium leading-[0.92] tracking-display">
              Support that
              <br />
              talks back.
              <span className="block text-paper/40">In real time.</span>
            </h1>
            <p className="mt-7 max-w-lg text-[16px] leading-relaxed text-paper/70">
              A customer-support desk built on <span className="text-paper">Ravex</span>: live chat, presence, typing, read receipts and reactions. Every
              message is saved to PostgreSQL <em className="not-italic text-plum-300">before</em> anyone sees it.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/register" className="btn-press rounded-full bg-plum-500 px-6 py-3 text-sm font-medium text-white [--ledge:var(--color-plum-800)] hover:bg-plum-600">
                Start a conversation
              </Link>
              <Link to="/login" className="btn-press rounded-full border-[1.5px] border-paper bg-transparent px-6 py-3 text-sm font-medium text-paper [--ledge:var(--color-paper)] hover:bg-paper/10">
                Sign in to the desk
              </Link>
              <a href="#demo" className="px-2 font-mono text-[11px] uppercase tracking-[0.1em] text-paper/60 hover:text-paper">
                Watch the demo ↓
              </a>
            </div>
          </div>
          <div className="relative -mx-4 text-paper/80 sm:mx-0">
            <RavenDiagram className="h-auto w-full max-h-[540px]" />
          </div>
        </div>
        <div className="relative flex items-center justify-between gap-4 border-t border-paper/10 px-6 py-4 sm:px-12">
          <Annotation k="D" v={<span className="text-paper/70">50,0</span>} className="text-paper/40!" />
          <Ruler tone="paper" label={<span className="text-paper/60">customer · agent · admin</span>} className="flex-1" />
          <Annotation k="V" v={<span className="text-paper/70">0.1.1</span>} className="text-paper/40!" />
        </div>
        {/* Outlined RAVEX across the bottom, after the Ravex site's banner type. */}
        <div aria-hidden className="relative -mb-[0.18em] flex select-none justify-between px-6 text-[clamp(4rem,17vw,15rem)] font-bold leading-none text-transparent sm:px-12" style={{ WebkitTextStroke: '1px rgba(250,252,252,0.16)' }}>
          {'RAVEX'.split('').map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  { glyph: '⇄', title: 'Realtime chat', body: 'One Ravex room per conversation. Messages arrive instantly for the customer, the assigned agent and any watching admin.', k: 'Order', v: 'save → broadcast' },
  { glyph: '◎', title: 'Presence', body: 'Online, away and offline, live. “Last seen 5 minutes ago” when someone’s gone.', k: 'Away', v: 'after 5 min idle' },
  { glyph: '⠿', title: 'Typing indicators', body: 'See when the other side is writing. Throttled by Ravex, cleared automatically after 3 seconds.', k: 'Stored', v: 'never' },
  { glyph: '✓✓', title: 'Read receipts', body: 'Sent and Read under every message, stored in PostgreSQL so they survive refreshes and devices.', k: 'Unread', v: 'per conversation' },
  { glyph: '♥', title: 'Reactions', body: '👍 ❤️ 😂 😮 😢 on any message, saved and synced to everyone in the room.', k: 'Set', v: '5 emoji' },
  { glyph: '⇪', title: 'File uploads', body: 'Images, PDFs and documents via Cloudinary. File types are verified from the file’s bytes, not its name.', k: 'Limit', v: '10 MB · 5 per message' },
  { glyph: '▤', title: 'Live queue', body: 'New conversations appear for agents instantly. First to accept wins, so no customer is answered twice.', k: 'Race-safe', v: 'conditional update' },
  { glyph: '▲', title: 'Admin analytics', body: 'Totals, 14-day charts, online agents and an activity feed. Manage users, agents and departments.', k: 'Window', v: '14 days' },
  { glyph: '⛨', title: 'Security built in', body: 'JWT + bcrypt, role checks on every request and every socket event, rate limits and strict validation.', k: 'Secrets in browser', v: '0' },
]

function Features() {
  return (
    <section id="features" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-28 sm:px-8">
      <SectionHead index={2} eyebrow="Features" title="Everything live." aside="Nothing lost.">
        Ravex handles the realtime layer; PostgreSQL keeps the record; Cloudinary keeps the files. You get a support desk that feels instant and never forgets.
      </SectionHead>
      <div className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 90} className="h-full">
            <article className="group relative flex h-full flex-col bg-surface p-7 transition-colors hover:bg-paper-2">
              <div className="flex items-start justify-between">
                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line-strong font-mono text-lg text-ink transition-colors group-hover:border-plum-500 group-hover:text-plum-500">
                  {f.glyph}
                </span>
                <span className="font-mono text-[11px] text-mute">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-8 text-xl font-medium tracking-tight text-ink">{f.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-graphite">{f.body}</p>
              <Annotation k={f.k} v={f.v} className="mt-6" />
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Demo() {
  return (
    <section id="demo" className="scroll-mt-24 border-y border-line bg-paper-2/60">
      <div className="mx-auto max-w-7xl px-5 py-28 sm:px-8">
        <SectionHead index={1} eyebrow="Live demo" title="One conversation," aside="two screens.">
          The same chat from the customer’s side and the agent’s side, as it happens: queue, accept, typing, reply, read receipt, reaction, resolved.
        </SectionHead>
        <Reveal>
          <DemoReel />
        </Reveal>
      </div>
    </section>
  )
}

const STEPS = [
  { title: 'Customer asks', body: 'They open a conversation with a subject and department. It lands in every agent’s queue at once.' },
  { title: 'Agent accepts', body: 'The first agent to accept owns it; everyone else is removed from the live room automatically.' },
  { title: 'They chat, live', body: 'Messages, typing, read receipts and reactions flow through Ravex — each one checked and stored first.' },
  { title: 'Resolved', body: 'Pending while waiting on the customer, closed when done, reopened if needed. Admins see it all.' },
]

function HowItWorks() {
  const node = (label: string, sub: string, accent = false) => (
    <div className={cx('relative border px-4 py-3 text-center', accent ? 'keep-light border-ink bg-ink text-paper' : 'border-line-strong bg-surface text-ink')}>
      <p className="text-sm font-medium">{label}</p>
      <p className={cx('mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em]', accent ? 'text-paper/55' : 'text-mute')}>{sub}</p>
    </div>
  )
  const link = (label: string) => (
    <div className="flex flex-col items-center justify-center gap-1 py-1 lg:px-1 lg:py-0">
      <span className="annot whitespace-nowrap">{label}</span>
      <span className="h-6 w-px bg-line-strong lg:h-px lg:w-full" />
    </div>
  )
  return (
    <section id="how" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-28 sm:px-8">
      <SectionHead index={3} eyebrow="How it works" title="Save first." aside="Then broadcast.">
        Ravex runs our message middleware before it delivers anything, so a message only reaches the other person once it’s stored. REST and WebSocket share the same rules.
      </SectionHead>

      <Reveal className="mb-16 overflow-hidden border border-line bg-surface p-6 sm:p-10">
        <div className="bg-dots relative grid grid-cols-1 items-center gap-1 p-2 lg:grid-cols-[1fr_auto_1.2fr_auto_1fr_auto_1fr]">
          {node('Browser', 'React · @ravex/client')}
          {link('WebSocket + JWT')}
          {node('Ravex + guard', 'rooms · presence · typing', true)}
          {link('middleware')}
          {node('Services', 'same rules for REST')}
          {link('Prisma')}
          {node('PostgreSQL', 'Neon · source of truth')}
        </div>
        <Ruler className="mt-6" label="message saved → then delivered to the room" />
      </Reveal>

      <ol className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <Reveal key={s.title} delay={i * 100}>
            <li className="border-t-2 border-ink pt-5">
              <span className="font-mono text-[11px] text-plum-500">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-2 text-lg font-medium tracking-tight text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite">{s.body}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  )
}

const PORTALS = [
  { key: 'customer', label: 'Customer', title: 'Ask, and watch it happen.', points: ['Start conversations by department', 'See your agent online and typing', 'Read receipts, reactions, attachments', 'Close and reopen any time'] },
  { key: 'agent', label: 'Agent', title: 'A live queue, a calm inbox.', points: ['New conversations appear instantly', 'Accept with one click — first wins', 'Search customers, subjects, messages', 'Status, priority and department'] },
  { key: 'admin', label: 'Admin', title: 'The whole desk at a glance.', points: ['Totals, 14-day charts, activity feed', 'Assign or reassign any conversation', 'Manage users, agents, departments', 'Disable an account — sessions end now'] },
] as const

function Portals() {
  const [active, setActive] = useState<(typeof PORTALS)[number]['key']>('customer')
  const dark = useIsDark()
  const portal = PORTALS.find((p) => p.key === active) ?? PORTALS[0]
  return (
    <section id="portals" className="scroll-mt-24 border-y border-line bg-paper-2/60">
      <div className="mx-auto max-w-7xl px-5 py-28 sm:px-8">
        <SectionHead index={4} eyebrow="Three portals" title="One platform," aside="three points of view." />
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div>
            <div className="scrollbar-thin flex gap-1 overflow-x-auto lg:flex-col lg:gap-2" role="tablist" aria-label="Portal">
              {PORTALS.map((p, i) => (
                <button
                  key={p.key}
                  role="tab"
                  aria-selected={active === p.key}
                  onClick={() => setActive(p.key)}
                  className={cx(
                    'flex shrink-0 items-baseline gap-2 border-l-2 px-3 py-3 text-left transition-colors sm:gap-3 sm:px-4',
                    active === p.key ? 'border-plum-500 bg-surface text-ink' : 'border-line text-mute hover:text-ink',
                  )}
                >
                  <span className="font-mono text-[10px]">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-lg font-medium tracking-tight">{p.label}</span>
                </button>
              ))}
            </div>
            <div key={portal.key} className="mt-8 animate-rise">
              <h3 className="text-2xl font-medium tracking-tight text-ink">{portal.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {portal.points.map((pt) => (
                  <li key={pt} className="flex gap-3 text-sm text-graphite">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 bg-plum-500" />
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Reveal>
            <figure key={portal.key + dark} className="m-0 animate-rise overflow-hidden border border-line bg-surface shadow-[0_30px_80px_-40px_rgba(5,5,5,0.45)]">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                <span className="annot ml-3 truncate">ravex/support · {portal.label.toLowerCase()}</span>
              </div>
              <img
                src={`/landing/${portal.key}-${dark ? 'dark' : 'light'}.jpg`}
                alt={`${portal.label} portal of Ravex Support`}
                width={1440}
                height={900}
                loading="lazy"
                className="block h-auto w-full"
              />
            </figure>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

const FACTS = [
  { value: '3', label: 'Portals', sub: 'customer · agent · admin' },
  { value: '1', label: 'Source of truth', sub: 'PostgreSQL, saved before delivery' },
  { value: '0', label: 'Secrets in the browser', sub: 'keys live on the server' },
  { value: '∞', label: 'Reconnects', sub: 'rooms re-joined, missed messages fetched' },
]

const STACK = ['Ravex', 'Socket.IO', 'React 19', 'TypeScript', 'Express', 'Prisma', 'PostgreSQL · Neon', 'Cloudinary', 'Tailwind CSS', 'Vite']

function Facts() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-28 sm:px-8">
      <SectionHead index={5} eyebrow="Built to be trusted" title="Fast for people." aside="Strict with data." />
      <div className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
        {FACTS.map((f, i) => (
          <Reveal key={f.label} delay={i * 80} className="h-full">
            <div className="h-full bg-surface p-6 sm:p-8">
              <p className="text-[clamp(3rem,6vw,4.5rem)] font-medium leading-none tracking-display text-ink">{f.value}</p>
              <p className="mt-4 text-sm font-medium text-ink">{f.label}</p>
              <p className="mt-1 text-xs text-mute">{f.sub}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal className="mt-14">
        <Ruler label="stack" />
        <ul className="mt-6 flex flex-wrap justify-center gap-2">
          {STACK.map((s) => (
            <li key={s} className="rounded-full border border-line-strong bg-surface px-4 py-1.5 font-mono text-xs text-graphite">
              {s}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="px-3 pb-6 sm:px-5">
      <div className="keep-light relative mx-auto max-w-[1400px] overflow-hidden rounded-[28px] bg-ink px-6 py-20 text-center text-paper ring-1 ring-paper/10 sm:py-28">
        <GridBackdrop tone="dark" cells={14} />
        <Reveal className="relative">
          <RavenMark tone="plum" className="mx-auto h-20 w-auto animate-float sm:h-28" />
          <h2 className="mx-auto mt-8 max-w-3xl text-[clamp(2.5rem,6vw,5rem)] font-medium leading-[0.95] tracking-display">
            Open the desk.
            <span className="block text-paper/40">Someone’s waiting.</span>
          </h2>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="btn-press rounded-full bg-plum-500 px-6 py-3 text-sm font-medium text-white [--ledge:var(--color-plum-800)] hover:bg-plum-600">
              Create an account
            </Link>
            <Link to="/login" className="btn-press rounded-full border-[1.5px] border-paper px-6 py-3 text-sm font-medium text-paper [--ledge:var(--color-paper)] hover:bg-paper/10">
              Sign in
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-10 sm:px-8">
      <Wordmark />
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Annotation k="Realtime" v={<a className="hover:text-ink hover:underline" href="https://ravex-io.github.io/" target="_blank" rel="noreferrer">ravex</a>} />
        <Annotation k="Source" v={<a className="hover:text-ink hover:underline" href="https://github.com/ravex-io/ravex" target="_blank" rel="noreferrer">github</a>} />
        <Annotation k="Year" v={new Date().getFullYear()} />
      </div>
      <ThemeToggle className="sm:hidden" />
    </footer>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <TopBar />
      <main>
        <Hero />
        <Marquee
          items={['Realtime chat', 'Presence', 'Typing indicators', 'Read receipts', 'Emoji reactions', 'File uploads', 'Live queue', 'Admin analytics', 'Dark mode']}
          className="py-8 text-[clamp(1.5rem,3vw,2.25rem)] font-medium tracking-tight text-ink"
        />
        <Demo />
        <Features />
        <HowItWorks />
        <Portals />
        <Facts />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
