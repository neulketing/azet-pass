// Records every request and response body that crosses the wire between a client and the server.
// usage: node test/wire-proxy.mjs <listen-port> <upstream-base> <log-file> <tls-key> <tls-cert>  (TLS because Bitwarden clients refuse http)
import https from 'node:https'
import fs from 'node:fs'
const [port, upstream, logFile, key, cert] = process.argv.slice(2)
const log = fs.createWriteStream(logFile, { flags: 'a' })
https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = Buffer.concat(chunks)
  const headers = { ...req.headers }
  delete headers.host
  const r = await fetch(upstream + req.url, { method: req.method, headers, body: body.length ? body : undefined, redirect: 'manual' })
  const out = Buffer.from(await r.arrayBuffer())
  log.write(`>>> ${req.method} ${req.url}\n${body.toString('latin1')}\n<<< ${r.status}\n${out.toString('latin1')}\n`)
  const h = Object.fromEntries(r.headers)
  delete h['content-encoding']
  delete h['content-length']
  res.writeHead(r.status, h).end(out)
}).listen(Number(port), '127.0.0.1')
