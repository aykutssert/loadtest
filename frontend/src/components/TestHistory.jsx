import { useEffect, useState } from 'react'
import { API } from '../api'

const STATUS_COLORS = {
  queued: 'text-[#a78bfa] bg-[#7c3aed20]',
  running: 'text-[#60a5fa] bg-[#1d4ed820]',
  completed: 'text-[#34d399] bg-[#06652020]',
  failed: 'text-[#f87171] bg-[#ef444420]',
}

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export default function TestHistory({ onSelect }) {
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/tests`)
      .then((r) => r.json())
      .then(setTests)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-[#1a1a24] border border-[#2a2a3a] rounded-xl p-5">
      <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-widest mb-4">
        Recent Tests
      </h2>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-[#64748b]">
          <span className="w-3 h-3 border border-[#7c3aed] border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      )}

      {!loading && tests.length === 0 && (
        <p className="text-xs text-[#374151]">No tests yet. Run your first test above.</p>
      )}

      <ul className="space-y-2">
        {tests.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => onSelect(t.id)}
              className="w-full text-left bg-[#0f0f13] hover:bg-[#12121a] border border-[#2a2a3a] hover:border-[#7c3aed40] rounded-lg px-3 py-2.5 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLORS[t.status] ?? STATUS_COLORS.queued}`}
                >
                  {t.status}
                </span>
                <span className="text-[10px] text-[#374151]">{timeAgo(t.createdAt)}</span>
              </div>
              <p className="text-xs text-[#94a3b8] truncate">{t.targetUrl}</p>
              <p className="text-[10px] text-[#374151] mt-0.5">
                {t.requestCount?.toLocaleString()} req · {t.concurrency} concurrent
                {t.results && ` · ${t.results.rps?.toFixed(1)} RPS`}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
