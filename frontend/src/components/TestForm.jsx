import { useState } from 'react'
import { API } from '../api'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function parseHeaders(text) {
  const headers = {}
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim()
      if (key) headers[key] = val
    }
  }
  return headers
}

export default function TestForm({ onTestStart }) {
  const [form, setForm] = useState({
    targetUrl: '',
    requestCount: 500,
    concurrency: 50,
    method: 'GET',
    rampUpSeconds: '',
    timeoutSeconds: 30,
    headers: '',
    body: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${API}/tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl:      form.targetUrl,
          requestCount:   Number(form.requestCount),
          concurrency:    Number(form.concurrency),
          method:         form.method,
          rampUpSeconds:  form.rampUpSeconds !== '' ? Number(form.rampUpSeconds) : 0,
          timeoutSeconds: Number(form.timeoutSeconds),
          headers:        parseHeaders(form.headers),
          body:           form.body,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      onTestStart(data.testId)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const showBody = BODY_METHODS.has(form.method)
  const inputCls = "w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f97316] transition-colors"

  return (
    <div className="bg-[#0f0f1a] border border-[#1e1e2e] rounded-md p-6">
      <h2 className="text-xs font-medium text-white uppercase tracking-widest mb-5">
        Configure Test
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-[#d4d4d8] mb-1.5">Target URL</label>
          <input
            type="url"
            required
            placeholder="https://example.com"
            value={form.targetUrl}
            onChange={set('targetUrl')}
            className={inputCls + " placeholder-[#3f3f46]"}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[#d4d4d8] mb-1.5">Method</label>
            <select value={form.method} onChange={set('method')} className={inputCls}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#d4d4d8] mb-1.5">
              Requests <span className="text-[#f97316]">{Number(form.requestCount).toLocaleString()}</span>
            </label>
            <input type="number" min={1} max={5000} value={form.requestCount} onChange={set('requestCount')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-[#d4d4d8] mb-1.5">
              Concurrency <span className="text-[#f97316]">{form.concurrency}</span>
            </label>
            <input type="number" min={1} max={200} value={form.concurrency} onChange={set('concurrency')} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#d4d4d8] mb-1.5">
              Timeout <span className="text-[#a1a1aa]">s (per request)</span>
            </label>
            <input type="number" min={1} max={60} value={form.timeoutSeconds} onChange={set('timeoutSeconds')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-[#d4d4d8] mb-1.5">
              Ramp-up <span className="text-[#a1a1aa]">s (optional)</span>
            </label>
            <input
              type="number" min={1} max={300}
              placeholder="—"
              value={form.rampUpSeconds}
              onChange={set('rampUpSeconds')}
              className={inputCls + " placeholder-[#3f3f46]"}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[#d4d4d8] mb-1.5">
            Headers <span className="text-[#a1a1aa]">one per line — Key: Value</span>
          </label>
          <textarea
            rows={3}
            placeholder={"Authorization: Bearer token\nContent-Type: application/json"}
            value={form.headers}
            onChange={set('headers')}
            className={inputCls + " placeholder-[#3f3f46] resize-none font-mono text-xs leading-relaxed"}
          />
        </div>

        {showBody && (
          <div>
            <label className="block text-xs text-[#d4d4d8] mb-1.5">
              Request Body <span className="text-[#a1a1aa]">sent with every request</span>
            </label>
            <textarea
              rows={4}
              placeholder={'{"key": "value"}'}
              value={form.body}
              onChange={set('body')}
              className={inputCls + " placeholder-[#3f3f46] resize-none font-mono text-xs leading-relaxed"}
            />
          </div>
        )}

        {error && (
          <p className="text-xs text-[#f87171] bg-[#ef444408] border border-[#ef444420] rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded py-2.5 text-sm transition-colors"
        >
          {loading ? 'Starting…' : 'Run Test'}
        </button>
      </form>
    </div>
  )
}
