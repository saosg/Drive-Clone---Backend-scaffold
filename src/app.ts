import express from 'express'
import authRouter from './routes/auth'
import filesRouter from './routes/files'

const app = express()
app.use(express.json())
app.get('/health', (_req, res) => res.json({ ok: true }))
app.use('/auth', authRouter)
app.use('/files', filesRouter)

export default app
