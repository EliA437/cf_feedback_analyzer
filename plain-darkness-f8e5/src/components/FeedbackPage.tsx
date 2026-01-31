import './FeedbackPage.css'

interface FeedbackPageProps {
  onBack: () => void
}

function FeedbackPage({ onBack }: FeedbackPageProps) {
  return (
    <div className="feedback-page">
      <h1>Application Services Feedback</h1>
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
