const fs = require('fs')
const path = require('path')
const axios = require('axios')
const FormData = require('form-data')

async function run() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('usage: node multipart_demo.js <file> [serverUrl]')
    process.exit(1)
  }
  const server = process.argv[3] || 'http://localhost:3000'
  const filename = path.basename(filePath)
  const stat = fs.statSync(filePath)
  const mimetype = 'application/octet-stream'
  const { data } = await axios.post(`${server}/files/upload/initiate`, { filename, mimetype })
  const { fileId } = data

  const CHUNK = 5 * 1024 * 1024
  const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK })
  let part = 1
  for await (const chunk of stream) {
    const form = new FormData()
    form.append('chunk', chunk, { filename: filename })
    const headers = form.getHeaders()
    const res = await axios.put(`${server}/files/upload/${fileId}/part?partNumber=${part}`, form, { headers })
    console.log('uploaded part', part, res.data)
    part++
  }

  await axios.post(`${server}/files/upload/${fileId}/complete`)
  console.log('upload complete')
}

run().catch((e) => { console.error(e); process.exit(1) })
