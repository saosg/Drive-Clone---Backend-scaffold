import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config'

export interface AuthRequest extends Request {
  userId?: number
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_token' })
  const token = h.slice(7)
  try {
    const payload: any = jwt.verify(token, JWT_SECRET)
    req.userId = payload.sub
    return next()
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token' })
  }
}
