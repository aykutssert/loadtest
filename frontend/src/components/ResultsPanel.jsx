import { useEffect, useState } from 'react'
import { API } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const STATUS_COLORS = {
  queued: { bg: 'bg-[#7c3aed20]', text: 'text-[#a78bfa]', dot: 'bg-[#7c3aed]' },
  running: { bg: 'bg-[#1d4ed820]', text: 'text-[#60a5fa]', dot: 'bg-[#3b82f6]' },
  completed: { bg: 'bg-[#06652020]', text: 'text-[#34d399]', dot: 'bg-[#10b981]' },
  failed: { bg: 'bg-[#ef444420]', text: 'text-[#f87171]', dot: 'bg-[#ef4444]' },
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.queued
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'running' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  )
}

function MetricCard({ label, value, unit, accent }) {
  return (
    <div className="bg-[#0f0f13] border border-[#2a2a3a] rounded-xl p-4">
      <p className="text-xs text-[#64748b] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-[#f1f5f9]'}`}>
        {value}
        {unit && <span className="text-sm font-normal text-[#64748b] ml-1">{unit}</span>}
      </p>
    </div>
  )
}

export default function ResultsPanel({ testId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true

    const poll = async () => {
      try {
        const res = await fetch(`${API}/tests/${testId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (alive) setData(json)
        if (json.status === 'completed' || json.status === 'failed') return
      } catch (err) {
        if (alive) setError(err.message)
        return
      }
      if (alive) setTimeout(poll, 2000)
    }

    poll()
    return () => { alive = false }
  }, [testId])

  if (error) {
    return (
      <div className="bg-[#1a1a24] border border-[#2a2a3a] rounded-xl p-6">
        <p className="text-[#ef4444] text-sm">Error: {error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-[#1a1a24] border border-[#2a2a3a] rounded-xl p-6 flex items-center gap-3">
        <span className="w-4 h-4 border-2 border-[#7c3aed] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[#64748b]">Loading…</span>
      </div>
    )
  }

  const r = data.results

  const latencyChartData = r
    ? [
        { name: 'P50', value: r.latency.p50, color: '#10b981' },
        { name: 'P90', value: r.latency.p90, color: '#7c3aed' },
        { name: 'P99', value: r.latency.p99, color: '#ef4444' },
        { name: 'Avg', value: r.latency.avg, color: '#60a5fa' },
      ]
    : []

  return (
    <div className="bg-[#1a1a24] border border-[#2a2a3a] rounded-xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-widest mb-1">
            Test Results
          </h2>
          <p className="text-xs text-[#374151] font-mono">{testId}</p>
          <p className="text-xs text-[#64748b] mt-0.5 truncate max-w-xs">{data.targetUrl}</p>
        </div>
        <StatusBadge status={data.status} />
      </div>

      {/* Running spinner */}
      {data.status === 'running' && (
        <div className="flex items-center gap-3 text-sm text-[#60a5fa]">
          <span className="w-4 h-4 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
          Executing {data.requestCount.toLocaleString()} requests with concurrency {data.concurrency}…
        </div>
      )}

      {data.status === 'queued' && (
        <div className="flex items-center gap-3 text-sm text-[#a78bfa]">
          <span className="w-4 h-4 border-2 border-[#7c3aed] border-t-transparent rounded-full animate-spin" />
          Waiting for worker to pick up the task…
        </div>
      )}

      {/* Metrics */}
      {r && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Throughput" value={r.rps.toFixed(1)} unit="RPS" accent="text-[#a78bfa]" />
            <MetricCard label="P50 Latency" value={r.latency.p50.toFixed(0)} unit="ms" accent="text-[#34d399]" />
            <MetricCard label="P90 Latency" value={r.latency.p90.toFixed(0)} unit="ms" />
            <MetricCard label="P99 Latency" value={r.latency.p99.toFixed(0)} unit="ms" accent="text-[#f87171]" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Total Requests" value={r.totalRequests.toLocaleString()} />
            <MetricCard label="Success" value={r.successCount.toLocaleString()} accent="text-[#34d399]" />
            <MetricCard label="Errors" value={r.errorCount.toLocaleString()} accent={r.errorCount > 0 ? 'text-[#f87171]' : undefined} />
            <MetricCard
              label="Error Rate"
              value={r.errorRate.toFixed(1)}
              unit="%"
              accent={r.errorRate > 5 ? 'text-[#f87171]' : 'text-[#34d399]'}
            />
          </div>

          {/* Latency chart */}
          <div>
            <p className="text-xs text-[#64748b] mb-3">Latency Distribution (ms)</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={latencyChartData} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} unit="ms" />
                <Tooltip
                  contentStyle={{ background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#f1f5f9' }}
                  formatter={(v) => [`${v.toFixed(1)} ms`]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {latencyChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Status codes */}
          {Object.keys(r.statusCodes).length > 0 && (
            <div>
              <p className="text-xs text-[#64748b] mb-3">Status Codes</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(r.statusCodes).map(([code, count]) => (
                  <span
                    key={code}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold ${
                      code.startsWith('2')
                        ? 'bg-[#06652020] text-[#34d399]'
                        : code.startsWith('4') || code.startsWith('5')
                        ? 'bg-[#ef444420] text-[#f87171]'
                        : 'bg-[#1e293b] text-[#94a3b8]'
                    }`}
                  >
                    {code} <span className="opacity-60">×</span> {count.toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-[#374151]">
            Duration: {r.durationSeconds.toFixed(2)}s ·
            Min: {r.latency.min.toFixed(0)}ms ·
            Max: {r.latency.max.toFixed(0)}ms
          </p>
        </>
      )}
    </div>
  )
}
