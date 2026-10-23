import type { Request, Response } from 'express'
import * as admin from '../services/admin.service.js'

export async function stats(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await admin.getStats() })
}

export async function activity(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await admin.getActivity() })
}
