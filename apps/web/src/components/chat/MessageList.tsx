import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatDay } from '../../lib/format'
import type { Message } from '../../types/api'
import { Ruler } from '../brand'
import { Button, EmptyState } from '../ui'
import { MessageBubble } from './MessageBubble'

interface Props {
  messages: Message[]
  meId: string
  canInteract: boolean
  hasMore: boolean
  loadingOlder: boolean
  onLoadOlder(): Promise<void>
  /** Called when the newest messages are on screen (used to mark them read). */
  onSeenLatest(): void
  onToggleReaction(messageId: string, emoji: string): void
  onEdit(messageId: string, content: string): Promise<unknown> | undefined
  onDelete(messageId: string): Promise<unknown> | undefined
}

const NEAR_BOTTOM_PX = 80

export function MessageList({ messages, meId, canInteract, hasMore, loadingOlder, onLoadOlder, onSeenLatest, onToggleReaction, onEdit, onDelete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [unseen, setUnseen] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const firstId = useRef<string | undefined>(undefined)
  const lastId = useRef<string | undefined>(undefined)
  const heightBeforePrepend = useRef(0)

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = containerRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
    setUnseen(0)
  }

  // Keep the viewport stable when older messages are prepended; follow new ones when at the bottom.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const first = messages[0]?.id
    const last = messages.at(-1)
    if (firstId.current && first !== firstId.current && heightBeforePrepend.current) {
      el.scrollTop += el.scrollHeight - heightBeforePrepend.current
      heightBeforePrepend.current = 0
    } else if (last?.id !== lastId.current) {
      const isInitial = lastId.current === undefined
      if (isInitial || atBottom || last?.sender?.id === meId) scrollToBottom()
      else setUnseen((n) => n + 1)
    }
    firstId.current = first
    lastId.current = last?.id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  useEffect(() => {
    if (atBottom) onSeenLatest()
  }, [atBottom, messages, onSeenLatest])

  // Messages that arrived while the tab was in the background are read when it comes back.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && atBottom && onSeenLatest()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [atBottom, onSeenLatest])

  const loadOlder = () => {
    heightBeforePrepend.current = containerRef.current?.scrollHeight ?? 0
    setLoadError(false)
    void onLoadOlder().catch(() => {
      heightBeforePrepend.current = 0
      setLoadError(true)
    })
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={containerRef}
        onScroll={(e) => {
          const el = e.currentTarget
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
          setAtBottom(near)
          if (near) setUnseen(0)
        }}
        className="scrollbar-thin bg-dots h-full space-y-3 overflow-y-auto px-4 py-6 sm:px-8"
        role="log"
        aria-label="Messages"
      >
        {hasMore && (
          <div className="flex justify-center">
            <Button variant="secondary" size="sm" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? 'Loading…' : loadError ? 'Couldn’t load — retry' : 'Load older messages'}
            </Button>
          </div>
        )}
        {messages.length === 0 && <EmptyState title="No messages yet" description="Say hello to get the conversation started." />}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()
          return (
            <Fragment key={m.id}>
              {newDay && <Ruler className="my-5" label={<span className="text-graphite">{formatDay(m.createdAt)}</span>} />}
              <MessageBubble
                message={m}
                mine={m.sender?.id === meId}
                meId={meId}
                canInteract={canInteract}
                onToggleReaction={(emoji) => onToggleReaction(m.id, emoji)}
                onEdit={(content) => onEdit(m.id, content)}
                onDelete={() => onDelete(m.id)}
              />
            </Fragment>
          )
        })}
      </div>
      {!atBottom && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-paper shadow-[0_4px_0_0_var(--color-plum-700)] hover:bg-ink-3"
        >
          {unseen > 0 ? `${unseen} new message${unseen > 1 ? 's' : ''} ↓` : 'Scroll to bottom ↓'}
        </button>
      )}
    </div>
  )
}
