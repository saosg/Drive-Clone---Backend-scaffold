import { Worker } from 'bullmq'
import Redis from 'ioredis'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { MINIO } from './config'
import fs from 'fs'
import path from 'path'

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

const s3 = new S3Client({
  endpoint: MINIO.endpoint,
  region: 'us-east-1',
  credentials: {
    accessKeyId: MINIO.accessKey,
    secretAccessKey: MINIO.secretKey
  },
  forcePathStyle: true
})

const worker = new Worker(
  'file-processing',
  async (job) => {
    const { fileId, key } = job.data
    console.log('Processing file', fileId, key)
    // Example: download file to /tmp for processing
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: MINIO.bucket, Key: key }))
      const outPath = path.join(__dirname, '..', 'tmp', fileId)
      await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
      const stream = res.Body as any
      const writeStream = fs.createWriteStream(outPath)
      await new Promise((resolve, reject) => {
        stream.pipe(writeStream)
        stream.on('end', resolve)
        stream.on('error', reject)
      })
      console.log('Downloaded to', outPath)
      // TODO: perform background tasks (thumbnailing, virus-scan, metadata extraction)
    } catch (err) {
      console.error('worker error', err)
      throw err
    }
  },
  { connection }
)

worker.on('completed', (job) => console.log('job completed', job.id))
worker.on('failed', (job, err) => console.error('job failed', job?.id, err))
