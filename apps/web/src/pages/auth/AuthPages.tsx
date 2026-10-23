import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Annotation, GridBackdrop, Marquee, RavenDiagram, Ruler, Wordmark } from '../../components/brand'
import { Alert, Button, Field, Input, ThemeToggle } from '../../components/ui'
import { errorMessage } from '../../lib/format'
import { postAuthPath, useAuth } from '../../stores/auth'

const FEATURES = ['Socket.IO', 'Presence tracking', 'Typing indicators', 'Read receipts', 'Emoji reactions', 'Rooms per conversation', 'PostgreSQL persistence', 'Cloudinary uploads']

/** Black exhibition panel: spaced RAVEX letters, the annotated raven, and the feature ticker. */
function Exhibit() {
  return (
    <section className="keep-light relative hidden flex-col overflow-hidden bg-ink text-paper lg:flex lg:w-[56%]">
      <GridBackdrop tone="dark" cells={18} />
      <div className="relative flex justify-between px-10 pt-8 text-[clamp(4rem,8.5vw,8.5rem)] font-bold leading-none tracking-tight" aria-hidden>
        {'RAVEX'.split('').map((ch, i) => (
          <span key={i} className="animate-rise" style={{ animationDelay: `${i * 70}ms` }}>
            {ch}
          </span>
        ))}
      </div>
      <div className="relative flex items-center justify-between px-10 pt-3">
        <Annotation k="D" v="50,0" className="text-paper/40!" />
        <Ruler tone="paper" label={<span className="text-paper/60">support · realtime</span>} className="mx-6 flex-1" />
        <Annotation k="V" v="0,1" className="text-paper/40!" />
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-10 py-6 text-paper/80">
        <RavenDiagram className="h-full max-h-[520px] w-full" />
      </div>
      <Marquee items={FEATURES} className="relative border-t border-paper/10 py-5 text-2xl font-medium tracking-tight text-paper/85" />
    </section>
  )
}

function AuthLayout({ title, aside, children, footer }: { title: string; aside: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="flex min-h-dvh bg-paper">
      <Exhibit />
      <section className="relative flex flex-1 flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Ravex Support home">
            <Wordmark />
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="animate-rise text-[clamp(2.75rem,5vw,4rem)] font-medium leading-[0.95] tracking-display">
            {title}
            <span className="block text-mute">{aside}</span>
          </h1>
          <div className="mt-10 animate-rise [animation-delay:120ms]">{children}</div>
          <p className="mt-8 text-sm text-graphite">{footer}</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Annotation k="Auth" v="JWT · HS256" />
          <Annotation k="Transport" v="WebSocket" />
          <Annotation k="Store" v="PostgreSQL" />
        </div>
      </section>
    </main>
  )
}

/** Where to go after signing in: back to the page that required it, if it suits the role. */
function useRedirectAfterAuth() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return (role: Parameters<typeof postAuthPath>[0]) => navigate(postAuthPath(role, from), { replace: true })
}

export function LoginPage() {
  const { login } = useAuth()
  const redirect = useRedirectAfterAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      redirect((await login(email, password)).role)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      aside="to the support desk."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-ink underline decoration-plum-300 underline-offset-4 hover:decoration-plum-500">
            Create an account →
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const { register } = useAuth()
  const redirect = useRedirectAfterAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      redirect((await register(name, email, password)).role)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Get help,"
      aside="in real time."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-ink underline decoration-plum-300 underline-offset-4 hover:decoration-plum-500">
            Sign in →
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Name">
          <Input autoComplete="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
