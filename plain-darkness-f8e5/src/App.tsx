import { useState } from 'react'
import cloudflareLogo from './assets/Cloudflare_Logo.svg'
import FeedbackPage from './components/FeedbackPage'
import './App.css'

const FEATURES = [
  { value: 'app-services', label: "Cloudflare's Application Services (Performance and Security)" },
] as const

function App() {
  const [selectedFeature, setSelectedFeature] = useState<string>('')

  if (selectedFeature === 'app-services') {
    return (
      <FeedbackPage onBack={() => setSelectedFeature('')} />
    )
  }

  return (
    <>
      <header className="app-header">
        <a href="https://workers.cloudflare.com/" target="_blank" rel="noreferrer">
          <img src={cloudflareLogo} className="cloudflare-logo" alt="Cloudflare logo" />
        </a>
      </header>
      <div className="centered-content">
        <h1 className="page-title">AI Feedback Analyzer for Cloudflare</h1>
        <div className="feature-selector">
          <label htmlFor="feature-select">
            Which feature would you like to get feedback from?
          </label>
          <select
            id="feature-select"
            value={selectedFeature}
            onChange={(e) => setSelectedFeature(e.target.value)}
          >
            <option value="">Select a feature...</option>
            {FEATURES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  )
}

export default App
