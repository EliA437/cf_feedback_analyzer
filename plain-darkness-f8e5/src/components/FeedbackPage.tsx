import { useState } from 'react'
import './FeedbackPage.css'

interface FeedbackPageProps {
  onBack: () => void
}

function FeedbackPage({ onBack }: FeedbackPageProps) {
  const [imageNames, setImageNames] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)

  async function handleViewBucketImages() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bucket/images')
      const contentType = res.headers.get('content-type')
      if (!contentType?.includes('application/json')) {
        throw new Error(
          `Unexpected response (${res.status}). Is the dev server running? Try deploying with 'npm run deploy' to test against the live Worker.`
        )
      }
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to fetch images (${res.status})`)
      }
      setImageNames(data.images ?? [])
      setHasFetched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch images')
      setImageNames([])
      setHasFetched(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="feedback-page">
      <h1>Application Services Feedback</h1>
      <button
        type="button"
        className="view-bucket-button"
        onClick={handleViewBucketImages}
        disabled={loading}
      >
        {loading ? 'Loading...' : 'View Bucket Images'}
      </button>
      {error && <p className="bucket-error">{error}</p>}
      {hasFetched && !loading && !error && imageNames.length === 0 && (
        <p className="bucket-empty">No images found in bucket.</p>
      )}
      {imageNames.length > 0 && (
        <ul className="image-list">
          {imageNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
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
