import { useState } from 'react'
import './FeedbackPage.css'

interface AnalysisItem {
  key: string
  text: string
}

interface FeedbackPageProps {
  onBack: () => void
}

function FeedbackPage({ onBack }: FeedbackPageProps) {
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleViewAnalysis() {
    setLoading(true)
    setError(null)
    try {
      const triggerRes = await fetch('/api/trigger-analysis', { method: 'POST' })
      const triggerData = await triggerRes.json()
      if (!triggerRes.ok) {
        throw new Error(triggerData.error || 'Failed to trigger analysis')
      }

      let analysesList: AnalysisItem[] = []
      const analysisRes = await fetch('/api/analysis')
      const analysisData = await analysisRes.json()
      if (analysisRes.ok) {
        analysesList = analysisData.analyses ?? []
      }

      if (analysesList.length === 0 && triggerData.processed > 0) {
        await new Promise((r) => setTimeout(r, 3000))
        const retryRes = await fetch('/api/analysis')
        const retryData = await retryRes.json()
        if (retryRes.ok) analysesList = retryData.analyses ?? []
      }

      setAnalyses(analysesList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis')
      setAnalyses([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="feedback-page">
      <h1>Application Services Feedback</h1>
      <button
        type="button"
        className="view-analysis-button"
        onClick={handleViewAnalysis}
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Run & View Analysis'}
      </button>
      {error && <p className="analysis-error">{error}</p>}
      {analyses.length > 0 && (
        <div className="analysis-list">
          {analyses.map((item) => (
            <div key={item.key} className="analysis-card">
              <h3 className="analysis-card-title">
                {item.key.replace(/\.txt$/, '')}
              </h3>
              <p className="analysis-card-text">{item.text}</p>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="back-button"
        onClick={onBack}
      >
        Back
      </button>
    </div>
  )
}

export default FeedbackPage
