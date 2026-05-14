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
    <div className="min-h-screen bg-[#0f0f13] text-[#f1f5f9]">
      <header className="border-b border-[#2a2a3a] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#7c3aed] flex items-center justify-center font-bold text-sm select-none">
            L
          </div>
          <span className="text-lg font-semibold tracking-tight">LoadTest Engine</span>
          <span className="text-xs text-[#64748b] hidden sm:block">
            Async Distributed Load Testing · C# · Go · RabbitMQ · MongoDB
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
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
