import { useState, type FormEvent } from 'react'
import { formatBytes, formatTime } from '../../lib/format'
import { REACTIONS, type Message } from '../../types/api'
import { Ruler } from '../brand'
import { Button, Textarea, cx } from '../ui'

interface Props {
  message: Message
  mine: boolean
  /** Only participants can react/edit/delete. */
  canInteract: boolean
  meId: string
  onToggleReaction(emoji: string): void
  onEdit(content: string): Promise<unknown> | undefined
  onDelete(): Promise<unknown> | undefined
}

function Attachments({ message, mine }: { message: Message; mine: boolean }) {
  if (message.attachments.length === 0) return null
  return (
    <div className="mt-1.5 space-y-1.5">
      {message.attachments.map((a) =>
        a.resourceType === 'image' ? (
          <a key={a.id} href={a.secureUrl} target="_blank" rel="noopener noreferrer" className="block">
            <img src={a.secureUrl} alt={a.originalName} loading="lazy" className="max-h-64 max-w-full object-cover" />
          </a>
        ) : (
          <a
            key={a.id}
            href={a.secureUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cx('flex items-center gap-3 border px-3 py-2 text-sm', mine ? 'border-paper/20 hover:bg-paper/10' : 'border-line hover:bg-paper-2')}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] opacity-60">{a.originalName.split('.').pop()}</span>
            <span className="truncate">{a.originalName}</span>
            <span className="ml-auto shrink-0 font-mono text-[10.5px] opacity-60">{formatBytes(a.size)}</span>
          </a>
        ),
      )}
    </div>
  )
}

export function MessageBubble({ message, mine, canInteract, meId, onToggleReaction, onEdit, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [error, setError] = useState<string | null>(null)

  // System events are drawn as dimension lines across the timeline.
  if (message.type === 'SYSTEM') {
    return <Ruler className="my-4 px-2" label={`${message.content} · ${formatTime(message.createdAt)}`} />
  }

  const deleted = Boolean(message.deletedAt)
  const readByOthers = message.reads.some((r) => r.userId !== meId)
  const grouped = REACTIONS.map((emoji) => ({
    emoji,
    count: message.reactions.filter((r) => r.emoji === emoji).length,
    mine: message.reactions.some((r) => r.emoji === emoji && r.userId === meId),
  })).filter((r) => r.count > 0)

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault()
    const content = draft.trim()
    if (!content || content === message.content) {
      setEditing(false)
      return
    }
    try {
      await onEdit(content)
      setEditing(false)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Tools and the reaction picker float above the bubble (no layout shift); they appear on hover,
  // or on tap/focus on touch screens (the bubble is focusable).
  const floating = 'pointer-events-none absolute -top-8 z-10 flex gap-0.5 rounded-full border border-line bg-surface px-1 py-0.5 opacity-0 shadow-sm transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100'

  const tools = mine && canInteract && !deleted && !editing && (
    <div className={cx(floating, 'right-0')}>
      {message.type === 'TEXT' && (
        <button className="rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-mute hover:bg-paper-2 hover:text-ink" onClick={() => setEditing(true)} aria-label="Edit message">
          Edit
        </button>
      )}
      <button
        className="rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-mute hover:bg-paper-2 hover:text-danger"
        onClick={() => {
          if (confirm('Delete this message?')) void onDelete()?.catch((err: unknown) => setError(String(err)))
        }}
        aria-label="Delete message"
      >
        Delete
      </button>
    </div>
  )

  const reactionPicker = !mine && canInteract && !deleted && (
    <div className={cx(floating, 'left-0')} role="group" aria-label="Add reaction">
      {REACTIONS.map((emoji) => (
        <button key={emoji} className="rounded-full px-1 text-sm transition-transform hover:scale-125" onClick={() => onToggleReaction(emoji)} aria-label={`React ${emoji}`}>
          {emoji}
        </button>
      ))}
    </div>
  )

  const body = deleted ? (
    <p className="font-mono text-xs italic">This message was deleted</p>
  ) : editing ? (
    <form onSubmit={saveEdit} className="w-80 max-w-full space-y-2">
      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus className="bg-surface! text-ink" maxLength={5000} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className={mine ? 'text-paper/70 hover:bg-ink-3 hover:text-paper' : ''}>
          Cancel
        </Button>
        <Button size="sm" type="submit" variant={mine ? 'plum' : 'primary'}>
          Save
        </Button>
      </div>
    </form>
  ) : (
    <>
      {message.content && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{message.content}</p>}
      <Attachments message={message} mine={mine} />
    </>
  )

  return (
    <div className={cx('group flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cx('flex max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
        {!mine && message.sender && (
          <span className="mb-1 px-1 font-mono text-[10px] uppercase tracking-[0.1em] text-mute">
            {message.sender.name}
            {message.sender.role !== 'CUSTOMER' && <span className="text-plum-500"> · {message.sender.role.toLowerCase()}</span>}
          </span>
        )}
        <div className="relative" tabIndex={canInteract && !deleted ? 0 : undefined}>
          {tools}
          {reactionPicker}
          {/* Faceted bubbles: a cut corner on the speaker's side, like the low-poly raven. */}
          {mine ? (
            <div className={cx('facet-br px-4 py-2.5', deleted ? 'bg-paper-3 text-mute' : 'bg-ink text-paper')}>{body}</div>
          ) : (
            <div className="facet-outline">
              <div className={cx('facet-bl bg-surface px-4 py-2.5', deleted ? 'text-mute' : 'text-ink')}>{body}</div>
            </div>
          )}
        </div>
        {grouped.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {grouped.map((r) => (
              <button
                key={r.emoji}
                disabled={!canInteract}
                onClick={() => onToggleReaction(r.emoji)}
                className={cx(
                  'rounded-full border px-2 py-0.5 font-mono text-[11px] transition-colors',
                  r.mine ? 'border-plum-300 bg-plum-50 text-plum-700' : 'border-line bg-surface text-graphite hover:border-line-strong',
                )}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}
        <span className="mt-1 px-1 font-mono text-[10px] uppercase tracking-[0.06em] text-mute">
          {formatTime(message.createdAt)}
          {message.editedAt && !deleted && ' · edited'}
          {mine && !deleted && (readByOthers ? <span className="text-plum-500"> · Read</span> : ' · Sent')}
        </span>
        {error && <span className="px-1 text-xs text-danger">{error}</span>}
      </div>
    </div>
  )
}
