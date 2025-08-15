import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import morgan from 'morgan'
import path from 'path'
import { fileURLToPath } from 'url'

import authRoutes from './routes/auth.js'
import inviteRoutes from './routes/invite.js'
import taxeRoutes from './routes/taxe.js'
import drillRoutes from './routes/drill.js'
import usersRoutes from './routes/users.js'
import reportsRoutes from './routes/reports.js'
import familiesRoutes from './routes/families.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.set('trust proxy', 1) // important în Railway/Cloudflare
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

app.get('/health', (req, res) => res.json({ ok: true }))

app.use('/api/auth', authRoutes)
app.use('/api/invite', inviteRoutes)
app.use('/api/taxe', taxeRoutes)
app.use('/api/drill', drillRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/families', familiesRoutes)

app.use(express.static(path.join(__dirname, '../public')))
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '../public/index.html')))

const PORT = process.env.PORT || 8081
app.listen(PORT, () => console.log(`Listening on :${PORT}`))
