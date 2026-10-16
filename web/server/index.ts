/**
 * Minimal HTTP server for the coach. Run with:  npm run server
 * Reads ANTHROPIC_API_KEY (and optionally COACH_MODEL, PORT) from the environment,
 * never from client code. In development Vite proxies /api to this server.
 */
import http from 'node:http'
import { DEFAULT_MODEL, MAX_BODY_BYTES, handleCoach, makeRateLimiter, resolvePort } from './coach.ts'

const port = resolvePort(process.env.PORT)
const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || undefined
const model = process.env.COACH_MODEL?.trim() || DEFAULT_MODEL
const rateLimit = makeRateLimiter()

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    return send(res, 200, { ok: true, aiConfigured: Boolean(apiKey) })
  }
  if (req.method !== 'POST' || req.url !== '/api/coach') return send(res, 404, { error: 'not_found' })

  const chunks: Buffer[] = []
  let size = 0
  let aborted = false
  req.on('data', (c: Buffer) => {
    size += c.length
    if (size > MAX_BODY_BYTES) {
      aborted = true
      send(res, 413, { error: 'too_large' })
      req.destroy()
      return
    }
    chunks.push(c)
  })
  req.on('end', async () => {
    if (aborted) return
    const ip = req.socket.remoteAddress ?? 'unknown'
    const reply = await handleCoach(Buffer.concat(chunks).toString('utf8'), ip, { apiKey, model, rateLimit })
    send(res, reply.status, reply.body)
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`PocketPilot coach server on http://127.0.0.1:${port}  (${apiKey ? `AI enabled, model ${model}` : 'no ANTHROPIC_API_KEY: the app will use its built-in explainer'})`)
})
