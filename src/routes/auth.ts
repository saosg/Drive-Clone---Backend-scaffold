import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import prisma from '../prisma'
import { JWT_SECRET } from '../config'
import passport from 'passport'
import { initializePassport, issueJwtForUser } from '../passport'

const router = Router()

initializePassport()

router.post('/register', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'email+password required' })
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ error: 'email exists' })
  const hash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({ data: { email, password: hash, role: 'USER' } })
  const token = jwt.sign({ sub: user.id }, JWT_SECRET)
  res.json({ token })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'email+password required' })
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return res.status(401).json({ error: 'invalid' })
  const ok = await bcrypt.compare(password, user.password)
  if (!ok) return res.status(401).json({ error: 'invalid' })
  const token = jwt.sign({ sub: user.id }, JWT_SECRET)
  res.json({ token })
})

// OAuth routes
router.get('/oauth/google', passport.authenticate('google', { scope: ['email', 'profile'], session: false }))
router.get(
  '/oauth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/oauth/failure' }),
  (req, res) => {
    // @ts-ignore
    const token = issueJwtForUser((req.user))
    res.json({ token })
  }
)

router.get('/oauth/github', passport.authenticate('github', { scope: ['user:email'], session: false }))
router.get(
  '/oauth/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/auth/oauth/failure' }),
  (req, res) => {
    // @ts-ignore
    const token = issueJwtForUser((req.user))
    res.json({ token })
  }
)

router.get('/oauth/failure', (_req, res) => res.status(401).json({ error: 'oauth_failed' }))

export default router
