import { Request, Response, NextFunction } from 'express'
import prisma from '../prisma'

export async function hasFilePermission(userId: number, fileId: string, perm: string) {
  const p = await prisma.filePermission.findFirst({ where: { fileId, userId, perm } })
  return !!p
}

export async function requireFilePermission(req: Request & { userId?: number }, res: Response, next: NextFunction) {
  const userId = req.userId
  const { id } = req.params
  if (!userId) return res.status(401).json({ error: 'missing_auth' })
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file) return res.status(404).json({ error: 'not_found' })
  if (file.ownerId === userId) return next()
  const ok = await hasFilePermission(userId, id, 'read')
  if (!ok) return res.status(403).json({ error: 'forbidden' })
  return next()
}
