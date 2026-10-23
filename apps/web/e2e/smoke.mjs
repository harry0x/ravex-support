// Browser smoke test of the whole stack: real Chrome, three users (admin, customer, agent),
// exercising realtime chat end to end. Run against a running dev stack:
//
//   E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... pnpm --filter @support-chat/web e2e
//
// Needs Google Chrome installed (uses playwright-core with the "chrome" channel, no browser download).
// Creates an e2e customer and agent and disables both at the end. Do not point it at production.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5173'
const SHOTS = new URL('./screenshots/', import.meta.url).pathname
mkdirSync(SHOTS, { recursive: true })
const env = { SEED_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL, SEED_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD }
if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
  console.error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (an admin account on the target stack).')
  process.exit(1)
}
const tag = Date.now()
const customerEmail = `e2e-customer-${tag}@example.test`
const agentEmail = `e2e-agent-${tag}@example.test`
const consoleErrors = []
const failedRequests = []

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const step = (msg) => console.log(`✓ ${msg}`)
const bubble = (page, text) => page.getByRole('paragraph').filter({ hasText: text })

async function newPage(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(`[${name}] ${m.text()}`))
  page.on('pageerror', (e) => consoleErrors.push(`[${name}] pageerror ${e.message}`))
  page.on('response', (r) => r.status() >= 400 && failedRequests.push(`[${name}] ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`))
  return page
}

try {
  // ── Admin creates an agent through the UI ────────────────────────────────
  const admin = await newPage('admin')
  await admin.goto(`${WEB}/login`)
  await admin.getByLabel('Email').fill(env.SEED_ADMIN_EMAIL)
  await admin.getByLabel('Password').fill(env.SEED_ADMIN_PASSWORD)
  await admin.getByRole('button', { name: 'Sign in' }).click()
  await admin.waitForURL(`${WEB}/admin`)
  await admin.getByText('Total customers').waitFor()
  await admin.getByText('Live', { exact: true }).waitFor()
  step('admin signed in, dashboard + live connection')

  await admin.getByRole('link', { name: 'Users' }).click()
  await admin.getByLabel('Name').fill('E2E Agent')
  await admin.getByLabel('Email').fill(agentEmail)
  await admin.getByLabel('Temporary password').fill('password123')
  await admin.getByRole('button', { name: 'Create account' }).click()
  await admin.getByText(agentEmail).waitFor()
  step('admin created an agent account')

  // ── Customer registers and opens a conversation ───────────────────────────
  const customer = await newPage('customer')
  await customer.goto(`${WEB}/register`)
  await customer.getByLabel('Name').fill('E2E Customer')
  await customer.getByLabel('Email').fill(customerEmail)
  await customer.getByLabel('Password').fill('password123')
  await customer.getByRole('button', { name: 'Create account' }).click()
  await customer.waitForURL(`${WEB}/dashboard`)
  await customer.getByLabel('Subject').fill('Printer is on fire')
  await customer.getByLabel('Department').selectOption({ label: 'Technical Support' })
  await customer.getByLabel('Message').fill('It started smoking after the update.')
  await customer.getByRole('button', { name: 'Start conversation' }).click()
  await customer.waitForURL(/\/chat\//)
  await customer.getByText('It started smoking after the update.').first().waitFor()
  await customer.getByText('Waiting for an agent to join').waitFor()
  step('customer registered and opened a conversation')

  // ── Agent sees it in the queue live and accepts ───────────────────────────
  const agent = await newPage('agent')
  await agent.goto(`${WEB}/login`)
  await agent.getByLabel('Email').fill(agentEmail)
  await agent.getByLabel('Password').fill('password123')
  await agent.getByRole('button', { name: 'Sign in' }).click()
  await agent.waitForURL(`${WEB}/agent/dashboard`)
  await agent.getByText('Printer is on fire').first().waitFor()
  step('agent sees the conversation in the queue')
  await agent.screenshot({ path: `${SHOTS}agent-dashboard.png` })

  const row = agent.locator('div', { hasText: 'Printer is on fire' }).filter({ has: agent.getByRole('button', { name: 'Accept' }) }).last()
  await row.getByRole('button', { name: 'Accept' }).click()
  await agent.waitForURL(/\/agent\/conversations\//)
  await customer.getByText(/E2E Agent joined the conversation ·/).waitFor({ timeout: 10_000 })
  await customer.getByText(/E2E Agent · (online|away)/).waitFor({ timeout: 10_000 })
  step('agent accepted; customer saw the system message and agent presence live')

  // ── Typing, messages, read receipts ───────────────────────────────────────
  // Both chat views must have joined the Ravex room (typing events aren't replayed to late joiners).
  await agent.locator('[data-live="true"]').waitFor()
  await customer.locator('[data-live="true"]').waitFor()
  const composer = (p) => p.getByPlaceholder(/Type a message/)
  await composer(customer).pressSequentially('Hello?', { delay: 40 })
  await agent.getByText('E2E Customer is typing…').waitFor({ timeout: 10_000 })
  step('agent saw the customer typing')
  await composer(customer).press('Enter')
  await bubble(agent, 'Hello?').waitFor()
  step('customer → agent message delivered live')
  await agent.getByLabel(/\d+ unread/).waitFor({ state: 'detached', timeout: 10_000 })
  step('agent’s unread badge cleared after reading')

  await composer(agent).fill('Hi! Please unplug it first.')
  await composer(agent).press('Enter')
  await bubble(customer, 'Hi! Please unplug it first.').waitFor()
  step('agent → customer message delivered live')
  await agent.getByText('· Read').last().waitFor({ timeout: 10_000 })
  step('agent saw the read receipt')

  // ── Reaction ──────────────────────────────────────────────────────────────
  await bubble(customer, 'Hi! Please unplug it first.').hover()
  await customer.getByRole('button', { name: 'React 👍' }).click()
  await agent.getByRole('button', { name: '👍 1' }).waitFor({ timeout: 10_000 })
  step('reaction shown live to the agent')

  // ── Agent edits its message ───────────────────────────────────────────────
  await bubble(agent, 'Hi! Please unplug it first.').hover()
  await agent.getByRole('button', { name: 'Edit message' }).click()
  await agent.locator('form textarea').first().fill('Hi! Please unplug it right now.')
  await agent.getByRole('button', { name: 'Save' }).click()
  await bubble(customer, 'Hi! Please unplug it right now.').waitFor()
  step('edit delivered live')

  // ── Status changes ────────────────────────────────────────────────────────
  await agent.getByLabel('Priority').selectOption('URGENT')
  await agent.getByLabel('Status').selectOption('PENDING')
  await customer.getByText(/E2E Agent marked the conversation as pending ·/).waitFor()
  step('status change announced live')
  for (let i = 0; i < 20 && (await agent.getByLabel('Status').inputValue()) !== 'PENDING'; i++) await agent.waitForTimeout(250)
  if ((await agent.getByLabel('Status').inputValue()) !== 'PENDING') throw new Error('agent status control did not settle on PENDING')
  if ((await agent.getByLabel('Priority').inputValue()) !== 'URGENT') throw new Error('agent priority control is not URGENT')
  step('agent controls show the latest status and priority')
  await customer.screenshot({ path: `${SHOTS}customer-chat.png` })
  await agent.screenshot({ path: `${SHOTS}agent-chat.png` })

  await customer.getByRole('button', { name: 'Close conversation' }).click()
  await customer.getByText('This conversation is closed').waitFor()
  await agent.getByText(/E2E Customer closed the conversation ·/).waitFor()
  step('customer closed the conversation; agent saw it')

  // ── Admin views ───────────────────────────────────────────────────────────
  await admin.getByRole('link', { name: 'Overview' }).click()
  await admin.reload()
  await admin.getByRole('figure', { name: /New conversations per day/ }).waitFor()
  await admin.screenshot({ path: `${SHOTS}admin-dashboard.png`, fullPage: true })
  await admin.getByRole('link', { name: 'Conversations' }).click()
  await admin.getByLabel('Search').fill('printer')
  await admin.getByText('Printer is on fire').first().waitFor()
  step('admin search found the conversation')
  await admin.getByRole('link', { name: 'Agents' }).click()
  await admin.getByText('E2E Agent').first().waitFor()
  await admin.screenshot({ path: `${SHOTS}admin-agents.png` })
  step('admin agents page')

  // Close their pages first: a disabled account's open page correctly gets 403s (and signs out),
  // which would otherwise show up as console errors.
  await customer.close()
  await agent.close()

  // Clean up: disable both accounts this run created.
  await admin.getByRole('link', { name: 'Users' }).click()
  for (const email of [agentEmail, customerEmail]) {
    const row = admin.getByRole('row').filter({ hasText: email })
    await row.getByRole('button', { name: 'Disable' }).click()
    await row.getByText('disabled', { exact: true }).waitFor()
  }
  step('cleaned up: e2e accounts disabled')

  console.log('\nE2E PASSED')
} catch (err) {
  console.error('\nE2E FAILED:', err.message)
  for (const ctx of browser.contexts()) for (const [i, p] of ctx.pages().entries()) await p.screenshot({ path: `${SHOTS}failure-${browser.contexts().indexOf(ctx)}-${i}.png` }).catch(() => {})
  process.exitCode = 1
} finally {
  console.log(`\nFailed requests (${failedRequests.length}):`)
  for (const r of failedRequests) console.log('  ' + r)
  console.log(`\nConsole errors (${consoleErrors.length}):`)
  for (const e of consoleErrors) console.log('  ' + e)
  console.log(`Accounts used: ${customerEmail}, ${agentEmail}`)
  await browser.close()
}
