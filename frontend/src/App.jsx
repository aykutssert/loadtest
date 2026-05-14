import { useState } from 'react'
import TestForm from './components/TestForm'
import ResultsPanel from './components/ResultsPanel'
import TestHistory from './components/TestHistory'

export default function App() {
  const [activeTestId, setActiveTestId] = useState(null)
  const [historyKey, setHistoryKey] = useState(0)

  const handleTestStart = (testId) => {
    setActiveTestId(testId)
    setHistoryKey((k) => k + 1)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e2e8f0]">
      <header className="border-b border-[#1e1e2e] px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold tracking-tight text-white">Surge</span>
            <span className="hidden sm:inline text-xs text-[#3f3f52] select-none">|</span>
            <span className="hidden sm:block text-xs text-[#4a4a62]">
              Distributed load testing · C# · Go · RabbitMQ
            </span>
          </div>
          <a
            href="https://kernelgallery.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#4a4a62] hover:text-[#94a3b8] transition-colors"
          >
            kernelgallery.com
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <TestForm onTestStart={handleTestStart} />
          {activeTestId && (
            <ResultsPanel testId={activeTestId} />
          )}
        </div>
        <aside>
          <TestHistory key={historyKey} onSelect={setActiveTestId} />
        </aside>
      </main>
    </div>
  )
}
