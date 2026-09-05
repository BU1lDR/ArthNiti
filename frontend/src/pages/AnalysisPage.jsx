import { Link } from 'react-router-dom'
import Button from '../components/Button'

function AnalysisPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/location"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back
        </Link>

        <div className="mt-8">
          <p className="text-sm font-semibold text-green-600">Step 4 of 6</p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Your Business Analysis
          </h1>

          <p className="mt-3 max-w-2xl text-slate-600">
            Here is a simple overview of your business opportunity based on
            the information you provided.
          </p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <AnalysisCard
            icon="📈"
            title="Business Opportunity"
            value="Promising"
            description="Your business has potential in the local market."
          />

          <AnalysisCard
            icon="📍"
            title="Local Market"
            value="Good Potential"
            description="Local families can provide a strong customer base."
          />

          <AnalysisCard
            icon="💪"
            title="Key Strength"
            value="Existing Experience"
            description="Your previous business experience can reduce startup risk."
          />

          <AnalysisCard
            icon="⚠️"
            title="Main Risk"
            value="Cost Management"
            description="Keep operating costs under control while expanding."
          />
        </div>

        <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            AI Recommendation
          </h2>

          <p className="mt-3 leading-7 text-slate-600">
            Based on your business information and local context, consider
            growing gradually, tracking monthly income and expenses, and
            checking available financial support before taking on additional
            borrowing.
          </p>
        </div>

        

          <Link to="/finance">
  <Button className="w-full py-4">
    Continue to Financial Planning →
  </Button>
</Link>

          
  
        </div>
      
    </main>
  )
}

function AnalysisCard({ icon, title, value, description }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="text-3xl">{icon}</div>

      <h2 className="mt-4 font-semibold text-slate-900">{title}</h2>

      <p className="mt-1 text-lg font-bold text-green-700">{value}</p>

      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  )
}

export default AnalysisPage