import { prisma } from '../config/database.js'
import { realtime } from './realtime.js'

const DAY_MS = 24 * 60 * 60 * 1000
export const STATS_DAYS = 14

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/** Buckets timestamps into UTC days, oldest first, including empty days. */
function perDay(dates: Date[], from: Date, days: number): { date: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const d of dates) {
    const key = startOfUtcDay(d).toISOString().slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from({ length: days }, (_, i) => {
    const key = new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10)
    return { date: key, count: counts.get(key) ?? 0 }
  })
}

/**
 * Dashboard numbers. Daily series are bucketed in JS from timestamps of the last 14 days, which
 * keeps the queries portable (no raw SQL); at larger scale this should move to SQL `date_trunc`.
 */
export async function getStats() {
  const today = startOfUtcDay(new Date())
  const from = new Date(today.getTime() - (STATS_DAYS - 1) * DAY_MS)

  const [customers, agents, byStatus, messagesToday, conversationDates, messageDates] = await Promise.all([
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.user.findMany({ where: { role: 'AGENT', status: 'ACTIVE' }, select: { id: true } }),
    prisma.conversation.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.message.count({ where: { createdAt: { gte: today }, type: { not: 'SYSTEM' } } }),
    prisma.conversation.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    prisma.message.findMany({ where: { createdAt: { gte: from }, type: { not: 'SYSTEM' } }, select: { createdAt: true } }),
  ])

  const statusCount = (status: 'OPEN' | 'PENDING' | 'CLOSED') => byStatus.find((s) => s.status === status)?._count._all ?? 0

  return {
    totals: {
      customers,
      agents: agents.length,
      onlineAgents: agents.filter((a) => realtime.presenceOf(a.id) !== 'offline').length,
      openConversations: statusCount('OPEN'),
      pendingConversations: statusCount('PENDING'),
      closedConversations: statusCount('CLOSED'),
      messagesToday,
    },
    conversationsPerDay: perDay(conversationDates.map((c) => c.createdAt), from, STATS_DAYS),
    messagesPerDay: perDay(messageDates.map((m) => m.createdAt), from, STATS_DAYS),
  }
}

/** Recent activity feed: new conversations, system events (assignments, status changes) and sign-ups. */
export async function getActivity(limit = 30) {
  const [conversations, systemMessages, users] = await Promise.all([
    prisma.conversation.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, subject: true, createdAt: true, customer: { select: { name: true } } },
    }),
    prisma.message.findMany({
      where: { type: 'SYSTEM' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, content: true, createdAt: true, conversation: { select: { id: true, subject: true } } },
    }),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, name: true, role: true, createdAt: true } }),
  ])

  const items = [
    ...conversations.map((c) => ({
      id: `conversation-${c.id}`,
      kind: 'conversation.created' as const,
      text: `${c.customer.name} opened “${c.subject}”`,
      conversationId: c.id,
      at: c.createdAt,
    })),
    ...systemMessages.map((m) => ({
      id: `system-${m.id}`,
      kind: 'conversation.event' as const,
      text: `${m.content} (“${m.conversation.subject}”)`,
      conversationId: m.conversation.id,
      at: m.createdAt,
    })),
    ...users.map((u) => ({
      id: `user-${u.id}`,
      kind: 'user.created' as const,
      text: `${u.name} joined as ${u.role.toLowerCase()}`,
      conversationId: null,
      at: u.createdAt,
    })),
  ]
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit)
}
