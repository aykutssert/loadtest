import { useState } from 'react'
import { API } from '../api'

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']

export default function TestForm({ onTestStart }) {
  const [form, setForm] = useState({
    targetUrl: '',
    requestCount: 500,
    concurrency: 50,
    method: 'GET',
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
    <div className="bg-[#1a1a24] border border-[#2a2a3a] rounded-xl p-6">
      <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-widest mb-5">
        Configure Test
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* URL */}
        <div>
          <label className="block text-xs text-[#64748b] mb-1.5">Target URL</label>
          <input
            type="url"
            required
            placeholder="https://example.com"
            value={form.targetUrl}
            onChange={set('targetUrl')}
            className="w-full bg-[#0f0f13] border border-[#2a2a3a] rounded-lg px-4 py-2.5 text-sm text-[#f1f5f9] placeholder-[#374151] focus:outline-none focus:border-[#7c3aed] transition-colors"
          />
        </div>

        {/* Method + Counts */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">Method</label>
            <select
              value={form.method}
              onChange={set('method')}
              className="w-full bg-[#0f0f13] border border-[#2a2a3a] rounded-lg px-3 py-2.5 text-sm text-[#f1f5f9] focus:outline-none focus:border-[#7c3aed] transition-colors"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">
              Requests <span className="text-[#7c3aed]">{Number(form.requestCount).toLocaleString()}</span>
            </label>
            <input
              type="number"
              min={1}
              max={5000}
              value={form.requestCount}
              onChange={set('requestCount')}
              className="w-full bg-[#0f0f13] border border-[#2a2a3a] rounded-lg px-3 py-2.5 text-sm text-[#f1f5f9] focus:outline-none focus:border-[#7c3aed] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">
              Concurrency <span className="text-[#7c3aed]">{form.concurrency}</span>
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={form.concurrency}
              onChange={set('concurrency')}
              className="w-full bg-[#0f0f13] border border-[#2a2a3a] rounded-lg px-3 py-2.5 text-sm text-[#f1f5f9] focus:outline-none focus:border-[#7c3aed] transition-colors"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-[#ef4444] bg-[#ef444410] border border-[#ef444430] rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 text-sm transition-colors"
        >
          {loading ? 'Starting…' : 'Start Test'}
        </button>
      </form>
    </div>
  )
}
