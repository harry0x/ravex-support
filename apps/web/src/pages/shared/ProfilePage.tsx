import { useState, type FormEvent } from 'react'
import { Annotation } from '../../components/brand'
import { Alert, Avatar, Button, Card, CardHeader, Field, Input, PageHeader } from '../../components/ui'
import { errorMessage } from '../../lib/format'
import { api } from '../../services/api'
import { useAuth, useCurrentUser } from '../../stores/auth'

export function ProfilePage() {
  const user = useCurrentUser()
  const { setUser } = useAuth()
  const [name, setName] = useState(user.name)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      setUser(await api.users.update(user.id, { name }))
      setMessage({ tone: 'success', text: 'Profile updated.' })
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <PageHeader
        eyebrow={
          <>
            <Annotation k="Role" v={user.role.toLowerCase()} />
            <Annotation k="Since" v={new Date(user.createdAt).toLocaleDateString()} />
          </>
        }
        title="Profile"
        aside={user.name}
      />
      <Card>
        <CardHeader index={1} title="Identity" />
        <div className="flex items-center gap-4 border-b border-line p-5">
          <Avatar name={user.name} size="lg" />
          <div>
            <p className="text-lg font-medium tracking-tight text-ink">{user.name}</p>
            <p className="font-mono text-xs text-mute">{user.email}</p>
          </div>
        </div>
        <form onSubmit={save} className="space-y-4 p-5">
          <Field label="Display name" hint="Shown to the people you chat with.">
            <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Button type="submit" disabled={saving || name.trim() === user.name}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
