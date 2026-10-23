import type { ReactNode } from 'react'
import { useConversationChat } from '../../hooks/useConversationChat'
import { timeAgo } from '../../lib/format'
import { useCurrentUser } from '../../stores/auth'
import { usePresence } from '../../stores/realtime'
import type { Conversation } from '../../types/api'
import { Annotation, BrailleSpinner } from '../brand'
import { Link } from 'react-router'
import { Avatar, ErrorState, PriorityBadge, Spinner, StatusBadge, cx } from '../ui'
import { Composer } from './Composer'
import { MessageList } from './MessageList'

export type ChatState = ReturnType<typeof useConversationChat>

function TypingIndicator({ names }: { names: string[] }) {
  return (
    <div className="flex h-6 items-center gap-2 bg-paper px-4 font-mono text-[11px] text-graphite sm:px-8" aria-live="polite">
      {names.length > 0 && (
        <>
          <BrailleSpinner className="text-plum-500" />
          <span>{`${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} typing…`}</span>
        </>
      )}
    </div>
  )
}

export interface ChatBackLink {
  to: string
  label: string
  /** Breakpoint from which the conversation list is visible beside the chat. */
  hideFrom: 'md' | 'lg'
}

function Header({ conversation, viewerIsCustomer, actions, back }: { conversation: Conversation; viewerIsCustomer: boolean; actions?: ReactNode; back?: ChatBackLink }) {
  const counterpart = viewerIsCustomer ? conversation.agent : conversation.customer
  const presence = usePresence(counterpart?.id, counterpart?.presence)
  const presenceText =
    presence === 'offline' ? (counterpart?.lastSeenAt ? `last seen ${timeAgo(counterpart.lastSeenAt)}` : 'offline') : presence

  return (
    <header className="border-b border-line bg-paper px-4 py-4 sm:px-8">
      {back && (
        <Link to={back.to} className={cx('annot mb-3 inline-flex items-center gap-1.5 hover:text-ink', back.hideFrom === 'md' ? 'md:hidden' : 'lg:hidden')}>
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <span className="hidden sm:inline-flex">
          {counterpart ? (
            <Avatar name={counterpart.name} presence={presence} size="lg" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-line-strong text-plum-500">
              <BrailleSpinner />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="min-w-0 truncate text-xl font-medium tracking-[-0.03em] text-ink sm:text-2xl">{conversation.subject}</h2>
            <StatusBadge status={conversation.status} />
            <PriorityBadge priority={conversation.priority} />
          </div>
          <p className="mt-1 truncate text-sm text-graphite">
            {counterpart ? `${counterpart.name} · ${presenceText}` : 'Waiting for an agent to join'}
          </p>
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        <Annotation k="ID" v={conversation.id.slice(0, 8)} />
        {!viewerIsCustomer && <Annotation k="Customer" v={<span className="normal-case">{conversation.customer.email}</span>} />}
        <Annotation k="Dept" v={conversation.department?.name ?? '—'} />
        <Annotation k="Opened" v={timeAgo(conversation.createdAt)} />
      </div>
    </header>
  )
}

/**
 * The full chat for one conversation. `renderActions` adds role-specific header controls
 * (close/reopen for customers; accept, status, priority and assignment for staff).
 */
export function ChatView({ conversationId, renderActions, back }: { conversationId: string; renderActions?: (chat: ChatState) => ReactNode; back?: ChatBackLink }) {
  const me = useCurrentUser()
  const chat = useConversationChat(conversationId)
  const { conversation } = chat

  if (chat.loading) return <Spinner label="Loading conversation" />
  if (chat.error || !conversation) return <ErrorState message={chat.error ?? 'Conversation not found'} onRetry={chat.retry} />

  const isParticipant = conversation.customer.id === me.id || conversation.agent?.id === me.id
  const viewerIsCustomer = me.role === 'CUSTOMER'
  const disabledReason =
    conversation.status === 'CLOSED'
      ? 'This conversation is closed. Reopen it to send messages.'
      : !isParticipant
        ? me.role === 'AGENT'
          ? 'Accept this conversation to reply.'
          : 'You are viewing this conversation. Assign an agent to reply.'
        : null

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper" data-live={chat.isLive}>
      <Header conversation={conversation} viewerIsCustomer={viewerIsCustomer} actions={renderActions?.(chat)} back={back} />
      {chat.roomError && (
        <div className="border-b border-caution/30 bg-surface px-4 py-2 font-mono text-[11px] text-caution sm:px-8">
          LIVE = OFF · {chat.roomError}
        </div>
      )}
      <MessageList
        messages={chat.messages}
        meId={me.id}
        canInteract={isParticipant && chat.isLive}
        hasMore={chat.hasMore}
        loadingOlder={chat.loadingOlder}
        onLoadOlder={chat.loadOlder}
        onSeenLatest={chat.markRead}
        onToggleReaction={(id, emoji) => void chat.toggleReaction(id, emoji)?.catch(() => undefined)}
        onEdit={chat.edit}
        onDelete={chat.remove}
      />
      <TypingIndicator names={chat.typingNames} />
      <Composer disabledReason={disabledReason} onSend={chat.send} onTyping={chat.startTyping} onStopTyping={chat.stopTyping} />
    </div>
  )
}
