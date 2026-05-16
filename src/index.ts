import app from './app'
import { PORT } from './config'
import './worker'

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${PORT}`)
})
