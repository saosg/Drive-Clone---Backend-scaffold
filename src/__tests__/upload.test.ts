import request from 'supertest'
import app from '../app'
import jwt from 'jsonwebtoken'

// Mock prisma, ioredis, and aws sdk
const mockPrisma: any = {
  file: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
}

jest.mock('../prisma', () => ({ __esModule: true, default: mockPrisma }))

// Mock ioredis with simple in-memory map
class MockRedis {
  store: Record<string, any>
  constructor() { this.store = {} }
  async del(k: string) { delete this.store[k] }
  async hset(k: string, field: string, val: string) { this.store[k] = this.store[k] || {}; this.store[k][field] = val }
  async hgetall(k: string) { return this.store[k] || {} }
}
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => new MockRedis())
})

// Mock S3 client
const mockSend = jest.fn()
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
    CreateMultipartUploadCommand: jest.fn(),
    UploadPartCommand: jest.fn(),
    CompleteMultipartUploadCommand: jest.fn(),
    AbortMultipartUploadCommand: jest.fn()
  }
})

describe('multipart upload flow', () => {
  beforeEach(() => {
    mockPrisma.file.create.mockReset()
    mockPrisma.file.findUnique.mockReset()
    mockPrisma.file.update.mockReset()
    mockPrisma.file.delete.mockReset()
    mockSend.mockReset()
  })

  it('initiates, uploads part, and completes', async () => {
    // create returns file metadata
    mockPrisma.file.create.mockResolvedValue({ id: 'f1', key: 'f1/name' })
    // for initiate, mock S3 CreateMultipartUpload response
    mockSend.mockResolvedValueOnce({ UploadId: 'upload1' })
    const token = jwt.sign({ sub: 1 }, process.env.JWT_SECRET || 'change-me')
    const init = await request(app).post('/files/upload/initiate').set('Authorization', `Bearer ${token}`).send({ filename: 'name' })
    expect(init.status).toBe(200)
    const { fileId } = init.body
    expect(fileId).toBeDefined()

    // mock findUnique during part upload to return uploadId
    mockPrisma.file.findUnique.mockResolvedValue({ id: fileId, uploadId: 'upload1', bucket: 'drive', key: 'f1/name' })
    // mock UploadPart returning ETag
    mockSend.mockResolvedValueOnce({ ETag: '"etag1"' })
    const partRes = await request(app)
      .put(`/files/upload/${fileId}/part?partNumber=1`)
      .attach('chunk', Buffer.from('abc'), 'chunk.bin')
    expect(partRes.status).toBe(200)

    // mock CompleteMultipartUpload
    mockSend.mockResolvedValueOnce({})
    mockPrisma.file.findUnique.mockResolvedValue({ id: fileId, uploadId: 'upload1', bucket: 'drive', key: 'f1/name' })
    const complete = await request(app).post(`/files/upload/${fileId}/complete`)
    expect(complete.status).toBe(200)
  })
})
