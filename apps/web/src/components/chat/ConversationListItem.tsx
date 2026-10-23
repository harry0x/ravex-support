import { NavLink } from 'react-router'
import { timeAgo } from '../../lib/format'
import { usePresence } from '../../stores/realtime'
import type { Conversation } from '../../types/api'
import { BrailleSpinner } from '../brand'
import { Avatar, PriorityBadge, StatusBadge, cx } from '../ui'

/** Catalogue-style row for a conversation, from the viewer's perspective. */
export function ConversationListItem({ conversation, to, viewerIsCustomer }: { conversation: Conversation; to: string; viewerIsCustomer: boolean }) {
  const counterpart = viewerIsCustomer ? conversation.agent : conversation.customer
  const presence = usePresence(counterpart?.id, counterpart?.presence)
  const preview =
    conversation.lastMessage?.type === 'SYSTEM'
      ? conversation.lastMessage.content
      : conversation.lastMessage?.content || (conversation.lastMessage ? 'Attachment' : 'No messages yet')
  const unread = conversation.unreadCount > 0

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          'group relative flex gap-3.5 border-b border-line px-5 py-4 transition-colors hover:bg-paper-2/70',
          isActive && 'bg-paper-2 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-plum-500',
        )
      }
    >
      {counterpart ? (
        <Avatar name={counterpart.name} presence={presence} />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-plum-500" title="Waiting for an agent">
          <BrailleSpinner className="text-sm" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <span className={cx('truncate text-[15px] tracking-tight text-ink', unread ? 'font-semibold' : 'font-medium')}>{conversation.subject}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-mute">{timeAgo(conversation.lastMessageAt ?? conversation.createdAt)}</span>
        </div>
        <div className="mt-0.5 truncate font-mono text-[10.5px] uppercase tracking-[0.06em] text-mute">
          {viewerIsCustomer ? (conversation.agent ? conversation.agent.name : 'Waiting for an agent') : conversation.customer.name}
          {conversation.department && ` / ${conversation.department.name}`}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className={cx('min-w-0 flex-1 truncate text-sm', unread ? 'text-ink' : 'text-graphite')}>{preview}</span>
          <PriorityBadge priority={conversation.priority} />
          <StatusBadge status={conversation.status} />
          {unread && (
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 font-mono text-[10px] font-semibold text-paper"
              aria-label={`${conversation.unreadCount} unread`}
            >
              {conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </NavLink>
  )
}
