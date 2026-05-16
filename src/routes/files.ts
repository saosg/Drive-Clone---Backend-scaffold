import { Router } from 'express'
import multer from 'multer'
import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3'
import { MINIO } from '../config'
import { prisma } from '../prisma'
import { v4 as uuidv4 } from 'uuid'
import Redis from 'ioredis'
import { Queue } from 'bullmq'
import { requireAuth } from '../middleware/auth'
import { requireFilePermission } from '../middleware/acl'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

const s3 = new S3Client({
  endpoint: MINIO.endpoint,
  region: 'us-east-1',
  credentials: {
    accessKeyId: MINIO.accessKey,
    secretAccessKey: MINIO.secretKey
  },
  forcePathStyle: true
})

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
const queue = new Queue('file-processing', { connection: redis })

// Simple single-request upload (kept for compatibility)
router.post('/upload', requireAuth, upload.single('file'), async (req: any, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'file required' })

  const id = uuidv4()
  const key = `${id}/${file.originalname}`

  await s3.send(
    new PutObjectCommand({
      Bucket: MINIO.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    })
  )

  const ownerId = Number(req.userId)
  const entry = await prisma.file.create({
    data: {
      id,
      name: file.originalname,
      size: file.size,
      mime: file.mimetype,
      bucket: MINIO.bucket,
      key,
      owner: { connect: { id: ownerId } }
    }
  })

  await queue.add('process', { fileId: entry.id, key })

  res.json({ file: entry })
})

// Multipart upload (S3 multipart)
router.post('/upload/initiate', requireAuth, async (req: any, res) => {
  const { filename } = req.body
  if (!filename) return res.status(400).json({ error: 'filename required' })
  const id = uuidv4()
  const key = `${id}/${filename}`
  const result = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: MINIO.bucket, Key: key, ContentType: req.body.mimetype })
  )
  const uploadId = result.UploadId
  const file = await prisma.file.create({
    data: {
      id,
      name: filename,
      bucket: MINIO.bucket,
      key,
      uploadId: uploadId || undefined,
      owner: { connect: { id: Number(req.userId) } }
    }
  })
  // initialize parts list in redis
  await redis.del(`upload:${id}:parts`)
  res.json({ fileId: id, uploadId })
})

router.put('/upload/:id/part', upload.single('chunk'), async (req, res) => {
  const { id } = req.params
  const partNumber = Number(req.query.partNumber)
  if (!partNumber || !req.file) return res.status(400).json({ error: 'partNumber and chunk required' })
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file || !file.uploadId) return res.status(404).json({ error: 'upload not found' })
  const uploadId = file.uploadId
  const uploadRes = await s3.send(
    new UploadPartCommand({
      Bucket: file.bucket,
      Key: file.key,
      PartNumber: partNumber,
      UploadId: uploadId,
      Body: req.file.buffer
    })
  )
  const etag = uploadRes.ETag
  // store etag in redis list for completion
  await redis.hset(`upload:${id}:parts`, String(partNumber), etag || '')
  res.json({ partNumber, etag })
})

router.post('/upload/:id/complete', async (req, res) => {
  const { id } = req.params
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file || !file.uploadId) return res.status(404).json({ error: 'upload not found' })
  const uploadId = file.uploadId
  const partsObj = await redis.hgetall(`upload:${id}:parts`)
  const parts = Object.keys(partsObj)
    .map((k) => ({ PartNumber: Number(k), ETag: partsObj[k] }))
    .sort((a, b) => a.PartNumber - b.PartNumber)

  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: file.bucket,
      Key: file.key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts }
    })
  )

  // update metadata (size unknown without head; could compute)
  await prisma.file.update({ where: { id }, data: { uploadId: null } })

  await queue.add('process', { fileId: id, key: file.key })

  res.json({ ok: true })
})

router.post('/upload/:id/abort', async (req, res) => {
  const { id } = req.params
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file || !file.uploadId) return res.status(404).json({ error: 'upload not found' })
  await s3.send(new AbortMultipartUploadCommand({ Bucket: file.bucket, Key: file.key, UploadId: file.uploadId }))
  await redis.del(`upload:${id}:parts`)
  await prisma.file.delete({ where: { id } })
  res.json({ ok: true })
})

// Filesystem operations
router.get('/', requireAuth, async (req: any, res) => {
  const folderId = req.query.folderId as string | undefined
  const page = Number(req.query.page || 1)
  const limit = Math.min(Number(req.query.limit || 50), 200)
  const skip = (page - 1) * limit
  const ownerId = Number(req.userId)
  const where: any = { ownerId }
  if (folderId) where.parentFolderId = folderId
  const [files, total] = await Promise.all([
    prisma.file.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.file.count({ where })
  ])
  res.json({ files, page, limit, total })
})

router.patch('/:id/rename', requireAuth, requireFilePermission, async (req: any, res) => {
  const { id } = req.params
  const { name } = req.body
  const ownerId = Number(req.userId)
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file || file.ownerId !== ownerId) return res.status(404).json({ error: 'not_found' })
  const updated = await prisma.file.update({ where: { id }, data: { name } })
  res.json({ file: updated })
})

router.post('/:id/move', requireAuth, requireFilePermission, async (req: any, res) => {
  // For now just update parentFolderId when folders exist
  const { id } = req.params
  const { folderId } = req.body
  const ownerId = Number(req.userId)
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file || file.ownerId !== ownerId) return res.status(404).json({ error: 'not_found' })
  const updated = await prisma.file.update({ where: { id }, data: { parentFolderId: folderId || null } as any })
  res.json({ file: updated })
})

router.delete('/:id', requireAuth, requireFilePermission, async (req: any, res) => {
  const { id } = req.params
  const ownerId = Number(req.userId)
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file || file.ownerId !== ownerId) return res.status(404).json({ error: 'not_found' })
  // delete from storage
  await s3.send(new AbortMultipartUploadCommand({ Bucket: file.bucket, Key: file.key, UploadId: file.uploadId || undefined }))
  // best-effort delete object
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: file.bucket, Key: file.key }))
  } catch {}
  await prisma.file.delete({ where: { id } })
  res.json({ ok: true })
})

// Sharing: create a share token
router.post('/:id/share', requireAuth, async (req: any, res) => {
  const { id } = req.params
  const { expiresInSeconds } = req.body
  const ownerId = Number(req.userId)
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file || file.ownerId !== ownerId) return res.status(404).json({ error: 'not_found' })
  const token = uuidv4()
  const expiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null
  const share = await prisma.share.create({ data: { file: { connect: { id } }, token, expiresAt, createdById: ownerId } })
  res.json({ share })
})

// Grant permission to another user for a file
router.post('/:id/permissions', requireAuth, async (req: any, res) => {
  const { id } = req.params
  const { targetUserId, perm } = req.body
  const ownerId = Number(req.userId)
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file || file.ownerId !== ownerId) return res.status(404).json({ error: 'not_found' })
  const entry = await prisma.filePermission.create({ data: { file: { connect: { id } }, user: { connect: { id: targetUserId } }, perm } })
  res.json({ permission: entry })
})

// Folder endpoints
router.post('/folders', requireAuth, async (req: any, res) => {
  const { name, parentId } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const ownerId = Number(req.userId)
  const folder = await prisma.folder.create({ data: { name, owner: { connect: { id: ownerId } }, parentId } })
  res.json({ folder })
})

router.get('/folders', requireAuth, async (req: any, res) => {
  const parentId = req.query.parentId as string | undefined
  const page = Number(req.query.page || 1)
  const limit = Math.min(Number(req.query.limit || 50), 200)
  const skip = (page - 1) * limit
  const ownerId = Number(req.userId)
  const where: any = { ownerId }
  if (parentId) where.parentId = parentId
  const [folders, total] = await Promise.all([
    prisma.folder.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.folder.count({ where })
  ])
  res.json({ folders, page, limit, total })
})

// Generate signed URL for direct download; requires ownership or valid share token
router.get('/:id/signed', async (req: any, res) => {
  const { id } = req.params
  const { token, expires = '300' } = req.query as any
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file) return res.status(404).json({ error: 'not_found' })
  const ownerId = req.userId ? Number(req.userId) : undefined
  if (!ownerId) {
    // if token provided, validate
    if (!token) return res.status(401).json({ error: 'unauthorized' })
    const share = await prisma.share.findUnique({ where: { token: String(token) }, include: { file: true } })
    if (!share || share.file.id !== id) return res.status(401).json({ error: 'unauthorized' })
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return res.status(410).json({ error: 'expired' })
  } else {
    if (file.ownerId !== ownerId) return res.status(403).json({ error: 'forbidden' })
  }

  const cmd = new GetObjectCommand({ Bucket: file.bucket, Key: file.key })
  const url = await getSignedUrl(s3, cmd, { expiresIn: Number(expires) })
  res.json({ url })
})

export default router

