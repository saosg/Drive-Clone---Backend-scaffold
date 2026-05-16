import request from 'supertest'
import app from '../app'
import jwt from 'jsonwebtoken'

const mockPrisma: any = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn()
  }
}

jest.mock('../prisma', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hashed'), compare: jest.fn().mockResolvedValue(true) }))

describe('auth routes', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockReset()
    mockPrisma.user.create.mockReset()
  })

  it('registers a user and returns token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.user.create.mockResolvedValue({ id: 1, email: 'a@b.com' })
    const res = await request(app).post('/auth/register').send({ email: 'a@b.com', password: 'pass' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    const payload: any = jwt.decode(res.body.token)
    expect(payload.sub).toBe(1)
  })

  it('logs in a user and returns token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 2, email: 'x@y.com', password: 'hashed' })
    const res = await request(app).post('/auth/login').send({ email: 'x@y.com', password: 'pass' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
  })
})
