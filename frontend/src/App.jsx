import { useState } from 'react'
import TestForm from './components/TestForm'
import ResultsPanel from './components/ResultsPanel'
import TestHistory from './components/TestHistory'
import InfoPanel from './components/InfoPanel'
import { addSessionTest } from './components/TestHistory'

export default function App() {
  const [activeTestId, setActiveTestId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleTestStart = (testId) => {
    addSessionTest(testId)
    setActiveTestId(testId)
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e2e8f0]">
      <header className="border-b border-[#1e1e2e] px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Kernel" className="w-6 h-6" />
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
          <InfoPanel />
        </div>
        <aside>
          <TestHistory refreshKey={refreshKey} onSelect={setActiveTestId} />
        </aside>
      </main>
    </div>
  )
}
