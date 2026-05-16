import request from 'supertest'
import app from '../app'
import jwt from 'jsonwebtoken'

const mockPrisma: any = {
  file: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  folder: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn()
  },
  share: { create: jest.fn(), findUnique: jest.fn() },
  filePermission: { create: jest.fn(), findFirst: jest.fn() }
}

jest.mock('../prisma', () => ({ __esModule: true, default: mockPrisma }))

describe('files routes', () => {
  beforeEach(() => {
    Object.values(mockPrisma).forEach((m: any) => {
      if (m && typeof m === 'object') Object.values(m).forEach((fn: any) => fn.mockReset && fn.mockReset())
    })
  })

  it('lists files with pagination', async () => {
    mockPrisma.file.findMany.mockResolvedValue([{ id: 'f1', name: 'a' }])
    mockPrisma.file.count.mockResolvedValue(1)
    const token = jwt.sign({ sub: 1 }, process.env.JWT_SECRET || 'change-me')
    const res = await request(app).get('/files').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.files).toBeDefined()
  })

  it('creates and lists folders', async () => {
    mockPrisma.folder.create.mockResolvedValue({ id: 'd1', name: 'docs' })
    mockPrisma.folder.findMany.mockResolvedValue([{ id: 'd1', name: 'docs' }])
    mockPrisma.folder.count.mockResolvedValue(1)
    const token = jwt.sign({ sub: 1 }, process.env.JWT_SECRET || 'change-me')
    const create = await request(app).post('/files/folders').set('Authorization', `Bearer ${token}`).send({ name: 'docs' })
    expect(create.status).toBe(200)
    const list = await request(app).get('/files/folders').set('Authorization', `Bearer ${token}`)
    expect(list.status).toBe(200)
    expect(list.body.folders).toHaveLength(1)
  })
})
