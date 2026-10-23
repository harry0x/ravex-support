import { SignJWT, jwtVerify } from 'jose'
import { env } from '../config/env.js'

const secret = new TextEncoder().encode(env.jwtSecret)
const ALGORITHM = 'HS256'

/** Tokens only carry the user id. Role and status are always read from the database. */
export function signAccessToken(userId: string): Promise<string> {
  return new SignJWT()
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.jwtExpiresIn)
    .sign(secret)
}

/** Returns the user id, or null if the token is invalid or expired. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALGORITHM] })
    return payload.sub ?? null
  } catch {
    return null
  }
}
