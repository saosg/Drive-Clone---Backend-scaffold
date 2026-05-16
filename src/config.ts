import dotenv from 'dotenv'

dotenv.config()

export const PORT = process.env.PORT || 3000
export const DATABASE_URL = process.env.DATABASE_URL || ''
export const JWT_SECRET = process.env.JWT_SECRET || 'change-me'
export const MINIO = {
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  bucket: process.env.MINIO_BUCKET || 'drive'
}
