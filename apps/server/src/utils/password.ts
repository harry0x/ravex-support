import bcrypt from 'bcryptjs'

// Cost 12 in real use; the minimum in tests, where hashing speed only slows the suite down.
const SALT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12

// Compared against when a login email doesn't exist, so response timing doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', SALT_ROUNDS)

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH).then((ok) => ok && hash !== null)
}
