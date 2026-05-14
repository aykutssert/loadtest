import { useState } from 'react'
import { API } from '../api'

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']

export default function TestForm({ onTestStart }) {
  const [form, setForm] = useState({
    targetUrl: '',
    requestCount: 500,
    concurrency: 50,
    method: 'GET',
    rampUpSeconds: '',
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
          targetUrl: form.targetUrl,
          requestCount: Number(form.requestCount),
          concurrency: Number(form.concurrency),
          method: form.method,
          rampUpSeconds: form.rampUpSeconds !== '' ? Number(form.rampUpSeconds) : 0,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      onTestStart(data.testId)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#0f0f1a] border border-[#1e1e2e] rounded-md p-6">
      <h2 className="text-xs font-medium text-[#94a3b8] uppercase tracking-widest mb-5">
        Configure Test
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-[#94a3b8] mb-1.5">Target URL</label>
          <input
            type="url"
            required
            placeholder="https://example.com"
            value={form.targetUrl}
            onChange={set('targetUrl')}
            className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-4 py-2.5 text-sm text-[#e2e8f0] placeholder-[#2a2a3a] focus:outline-none focus:border-[#2563eb] transition-colors"
          />
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Method</label>
            <select
              value={form.method}
              onChange={set('method')}
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#2563eb] transition-colors"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">
              Requests <span className="text-[#2563eb]">{Number(form.requestCount).toLocaleString()}</span>
            </label>
            <input
              type="number"
              min={1}
              max={5000}
              value={form.requestCount}
              onChange={set('requestCount')}
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#2563eb] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">
              Concurrency <span className="text-[#2563eb]">{form.concurrency}</span>
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={form.concurrency}
              onChange={set('concurrency')}
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#2563eb] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">
              Ramp-up <span className="text-[#94a3b8]">s (optional)</span>
            </label>
            <input
              type="number"
              min={1}
              max={300}
              placeholder="—"
              value={form.rampUpSeconds}
              onChange={set('rampUpSeconds')}
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-2.5 text-sm text-[#e2e8f0] placeholder-[#2a2a3a] focus:outline-none focus:border-[#2563eb] transition-colors"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-[#f87171] bg-[#ef444408] border border-[#ef444420] rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded py-2.5 text-sm transition-colors"
        >
          {loading ? 'Starting…' : 'Run Test'}
        </button>
      </form>
    </div>
  )
}
