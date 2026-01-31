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
  const [loadingStatus, setLoadingStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)
  const [bucketStatus, setBucketStatus] = useState<{
    imageCount: number
    analysisCount: number
    imageKeys: string[]
  } | null>(null)

  async function fetchAnalyses() {
    const res = await fetch('/api/analysis')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch analysis')
    return data.analyses ?? []
  }

  async function fetchBucketStatus() {
    const res = await fetch('/api/bucket-status')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to get bucket status')
    return data
  }

  async function handleCheckBucket() {
    setLoading(true)
    setError(null)
    try {
      const status = await fetchBucketStatus()
      setBucketStatus(status)
      setHasFetched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check bucket')
    } finally {
      setLoading(false)
    }
  }

  async function handleTestSingleImage() {
    setLoading(true)
    setError(null)
    setLoadingStatus('Testing pipeline (analyzing 1 image)...')
    try {
      const res = await fetch('/api/test-single-image', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.details || data.error || 'Test failed')
      }
      setLoadingStatus('')
      const analysesList = await fetchAnalyses()
      setAnalyses(analysesList)
      setHasFetched(true)
      setBucketStatus(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
      setLoadingStatus('')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefreshOnly() {
    setLoading(true)
    setError(null)
    setBucketStatus(null)
    try {
      const analysesList = await fetchAnalyses()
      setAnalyses(analysesList)
      setHasFetched(true)
      if (analysesList.length === 0) {
        try {
          const status = await fetchBucketStatus()
          setBucketStatus(status)
        } catch {
          setBucketStatus(null)
        }
      } else {
        setBucketStatus(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analysis')
    } finally {
      setLoading(false)
    }
  }

  async function handleViewAnalysis() {
    setLoading(true)
    setError(null)
    setLoadingStatus('Triggering analysis...')
    try {
      const triggerRes = await fetch('/api/trigger-analysis', {
        method: 'POST',
      })
      const contentType = triggerRes.headers.get('content-type')
      if (!contentType?.includes('application/json')) {
        throw new Error(
          `Unexpected response (${triggerRes.status}). Is the dev server running? Try deploying with 'npm run deploy' to test against the live Worker.`
        )
      }
      const triggerData = await triggerRes.json()
      if (!triggerRes.ok) {
        throw new Error(
          triggerData.error || `Failed to trigger analysis (${triggerRes.status})`
        )
      }

      setLoadingStatus('Processing all images (may take 1-2 min for 7 images)...')
      let analysesList: AnalysisItem[] = await fetchAnalyses()
      if (analysesList.length === 0) {
        await new Promise((r) => setTimeout(r, 5000))
        analysesList = await fetchAnalyses()
      }
      if (analysesList.length === 0) {
        setLoadingStatus('Still processing... checking again in 10s')
        await new Promise((r) => setTimeout(r, 10000))
        analysesList = await fetchAnalyses()
      }
      setAnalyses(analysesList)
      setLoadingStatus('')
      setHasFetched(true)
      if (analysesList.length === 0) {
        try {
          const status = await fetchBucketStatus()
          setBucketStatus(status)
        } catch {
          setBucketStatus(null)
        }
      } else {
        setBucketStatus(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis')
      setAnalyses([])
      setHasFetched(true)
      setLoadingStatus('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="feedback-page">
      <h1>Application Services Feedback</h1>
      <div className="analysis-actions">
        <button
          type="button"
          className="view-analysis-button"
          onClick={handleViewAnalysis}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Run & View Analysis'}
        </button>
        <button
          type="button"
          className="refresh-button"
          onClick={handleRefreshOnly}
          disabled={loading}
        >
          Refresh results
        </button>
        <button
          type="button"
          className="check-bucket-button"
          onClick={handleCheckBucket}
          disabled={loading}
        >
          Check bucket
        </button>
        <button
          type="button"
          className="test-single-button"
          onClick={handleTestSingleImage}
          disabled={loading}
        >
          Test 1 image
        </button>
      </div>
      {loadingStatus && (
        <p className="analysis-status">{loadingStatus}</p>
      )}
      {error && <p className="analysis-error">{error}</p>}
      {(hasFetched || bucketStatus) && !loading && !error && analyses.length === 0 && (
        <div className="analysis-empty">
          <p>
            No analysis found. Click &quot;Run & View Analysis&quot; to process all images (takes ~10–30s per image).
          </p>
          {bucketStatus && (
            <div className="bucket-diagnostics">
              <p className="diagnostics-title">Bucket status:</p>
              <ul>
                <li>Images found: {bucketStatus.imageCount} (we process .jpg, .jpeg, .png, .gif, .webp)</li>
                <li>Analysis files: {bucketStatus.analysisCount}</li>
              </ul>
              {bucketStatus.imageCount === 0 ? (
                <p className="diagnostics-warning">
                  No images in bucket. Upload .jpg, .png, etc. to mock-social-media-images in the Cloudflare dashboard.
                </p>
              ) : bucketStatus.analysisCount === 0 ? (
                <p className="diagnostics-warning">
                  Click &quot;Run & View Analysis&quot; to process. &quot;Test 1 image&quot; processes a single image for debugging.
                </p>
              ) : null}
              {bucketStatus.imageKeys.length > 0 && (
                <p className="diagnostics-keys">Image keys: {bucketStatus.imageKeys.join(', ')}</p>
              )}
            </div>
          )}
        </div>
      )}
      {analyses.length > 0 && (
        <div className="analysis-list">
          {analyses.map((item) => (
            <div key={item.key} className="analysis-card">
              <h3 className="analysis-card-title">{item.key}</h3>
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
