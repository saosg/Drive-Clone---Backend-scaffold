const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const path = require('path')

async function registerAndLogin(server, email, password) {
  await axios.post(`${server}/auth/register`, { email, password }).catch(() => {})
  const res = await axios.post(`${server}/auth/login`, { email, password })
  return res.data.token
}

async function uploadFileWithJwt(server, token, filePath) {
  const filename = path.basename(filePath)
  const stat = fs.statSync(filePath)
  const mimetype = 'application/octet-stream'
  // initiate
  const init = await axios.post(`${server}/files/upload/initiate`, { filename, mimetype }, { headers: { Authorization: `Bearer ${token}` } })
  const fileId = init.data.fileId

  const CHUNK = 5 * 1024 * 1024
  const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK })
  let part = 1
  for await (const chunk of stream) {
    const form = new FormData()
    form.append('chunk', chunk, { filename })
    const headers = Object.assign({}, form.getHeaders(), { Authorization: `Bearer ${token}` })
    await axios.put(`${server}/files/upload/${fileId}/part?partNumber=${part}`, form, { headers })
    part++
  }

  await axios.post(`${server}/files/upload/${fileId}/complete`, {}, { headers: { Authorization: `Bearer ${token}` } })
  console.log('E2E upload completed for', filePath)
}

async function main() {
  const server = process.argv[2] || 'http://localhost:3000'
  const file = process.argv[3]
  if (!file) {
    console.error('usage: node demo_e2e.js [server] <file>')
    process.exit(1)
  }
  const email = `testuser+${Date.now()}@example.com`
  const password = 'password123'
  const token = await registerAndLogin(server, email, password)
  await uploadFileWithJwt(server, token, file)
}

main().catch((e) => { console.error(e); process.exit(1) })
