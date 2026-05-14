import { useState } from 'react'

const SECTIONS = [
  {
    title: 'Parameters',
    items: [
      {
        term: 'Requests',
        def: 'Total number of HTTP requests to send to the target. A test with 1 000 requests at concurrency 50 sends all 1 000 requests but keeps at most 50 in-flight at any moment.',
      },
      {
        term: 'Concurrency',
        def: 'Maximum number of requests running simultaneously. Higher concurrency stresses the server more but also requires more resources on the worker. Start low and increase to find the breaking point.',
      },
      {
        term: 'Ramp-up (s)',
        def: 'If set, the worker gradually opens goroutines over this many seconds instead of hitting full concurrency instantly. Useful for simulating realistic traffic growth rather than a sudden spike.',
      },
      {
        term: 'Method',
        def: 'HTTP verb to use for every request. GET is read-only and safe to repeat. POST/PUT/DELETE may have side effects on the target — use with care.',
      },
    ],
  },
  {
    title: 'Latency Percentiles',
    items: [
      {
        term: 'P50 (median)',
        def: 'Half of all requests completed faster than this value. The closest metric to "typical" response time for a normal user.',
      },
      {
        term: 'P90',
        def: '90% of requests completed faster than this value. A good indicator of the experience for most users, including slightly slower ones.',
      },
      {
        term: 'P99',
        def: '99% of requests completed faster than this value. Captures tail latency — the worst 1% of requests. High P99 usually signals lock contention, GC pauses, or connection queue saturation.',
      },
      {
        term: 'Avg',
        def: 'Arithmetic mean of all latencies. Averages can be misleading when there are outliers — prefer P50 for typical performance and P99 for worst-case.',
      },
    ],
  },
  {
    title: 'Result Metrics',
    items: [
      {
        term: 'RPS (Requests per second)',
        def: 'Total requests divided by total test duration. Represents the actual throughput the worker achieved, which may be lower than the theoretical maximum if the target was slow.',
      },
      {
        term: 'Error Rate',
        def: 'Percentage of requests that failed — either due to a network error (timeout, connection refused) or a non-2xx HTTP status code returned by the target.',
      },
      {
        term: 'Status Codes',
        def: 'Distribution of HTTP response codes across all successful requests. 2xx means success, 4xx means client errors (bad request, not found), 5xx means server errors.',
      },
    ],
  },
]

export default function InfoPanel() {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-[#0f0f1a] border border-[#1e1e2e] rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-[#0a0a0f] transition-colors"
      >
        <span className="text-xs font-medium text-[#94a3b8] uppercase tracking-widest">
          How It Works
        </span>
        <svg
          className={`w-3.5 h-3.5 text-[#94a3b8] transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-6 border-t border-[#1e1e2e] pt-5">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-xs font-medium text-[#94a3b8] mb-3">{section.title}</p>
              <dl className="space-y-3">
                {section.items.map((item) => (
                  <div key={item.term}>
                    <dt className="text-xs font-medium text-[#94a3b8] mb-0.5">{item.term}</dt>
                    <dd className="text-xs text-[#94a3b8] leading-relaxed">{item.def}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
