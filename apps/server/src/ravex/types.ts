import type { PersistenceAdapter, SocketData } from '@ravex/server'

// @ravex/server 0.1.1 does not export its entity types (User, Message, Room) directly,
// so derive them from the public signatures that do.
export type RavexUser = SocketData['user']
export type RavexMessage = Parameters<PersistenceAdapter['saveMessage']>[0]
