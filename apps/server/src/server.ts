import { buildServer } from './app.js'
import { prisma } from './config/database.js'
import { env } from './config/env.js'

const { httpServer, realtime } = buildServer({ clientUrl: env.clientUrl })

httpServer.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port} (${env.nodeEnv})`)
})

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`)
  Promise.all([realtime.close(), prisma.$disconnect()]).then(
    () => process.exit(0),
    (err: unknown) => {
      console.error(err)
      process.exit(1)
    },
  )
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// Backstop: socket.io runs event handlers outside any try/catch, so an unexpected throw there
// would otherwise take the whole server down. The socket guard rejects malformed packets first;
// this keeps one bad request from becoming an outage if something still slips through.
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason))
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err))
