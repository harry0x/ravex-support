import type { ExtendedError, Socket } from 'socket.io'
import { authenticateToken } from '../services/auth.service.js'
import { AppError } from '../utils/AppError.js'
import type { RavexUser } from './types.js'

/**
 * Ravex's built-in handshake middleware copies `socket.handshake.auth.user` straight into
 * `socket.data.user`, trusting whatever the client sent (including id and status).
 *
 * This middleware must run *before* Ravex's (register it before constructing ChatEngine). It
 * verifies the JWT sent as `auth.token`, loads the user from the database, and replaces the
 * handshake payload with a server-built Ravex user.
 */
export async function authenticateSocket(socket: Socket, next: (err?: ExtendedError) => void): Promise<void> {
  const token: unknown = (socket.handshake.auth as Record<string, unknown>).token
  if (typeof token !== 'string' || token.length === 0) {
    next(new Error('Authentication required'))
    return
  }

  try {
    const user = await authenticateToken(token)
    const ravexUser: RavexUser = {
      id: user.id,
      // Ravex broadcasts `user:online/offline/status` (with username) to every connected socket,
      // so the username is a role label rather than the person's name. The real name is the
      // displayName, which Ravex only sends to rooms the user is in (message senderName, joins).
      username: user.role.toLowerCase(),
      displayName: user.name,
      avatar: user.avatarUrl ?? undefined,
      status: 'online',
      socketIds: [],
      metadata: { role: user.role },
    }
    socket.handshake.auth = { user: ravexUser }
    next()
  } catch (err) {
    next(new Error(err instanceof AppError ? err.message : 'Authentication failed'))
  }
}
