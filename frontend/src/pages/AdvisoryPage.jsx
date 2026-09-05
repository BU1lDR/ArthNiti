import { Link } from 'react-router-dom'
import Button from '../components/Button'

function AdvisoryPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/schemes"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back
        </Link>

        <div className="mt-8">
          <p className="text-sm font-semibold text-green-600">
            Your Personalized Advisory
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Your Business Action Plan
          </h1>

          <p className="mt-3 max-w-2xl text-slate-600">
            Here is a simple summary of what you can consider doing next based
            on your business, local context, and financial information.
          </p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <AdvisoryCard
            icon="🚀"
            title="Business Recommendation"
            value="Grow Gradually"
            description="Focus on controlled expansion instead of taking on unnecessary financial risk."
          />

          <AdvisoryCard
            icon="💰"
            title="Financial Recommendation"
            value="Track Monthly Surplus"
            description="Monitor revenue and expenses regularly before increasing your funding requirement."
          />

          <AdvisoryCard
            icon="🏛️"
            title="Funding Recommendation"
            value="Explore Eligible Schemes"
            description="Compare available government support before choosing external borrowing."
          />

          <AdvisoryCard
            icon="⚠️"
            title="Risk Level"
            value="Moderate"
            description="Review repayment capacity and operating costs carefully before taking additional debt."
          />
        </div>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Why this recommendation?
          </h2>

          <p className="mt-3 leading-7 text-slate-600">
            Your business already has experience and a local customer base.
            However, expansion should be supported by stable cash flow and
            careful cost management. Government schemes may reduce the amount
            of funding that needs to come from borrowing.
          </p>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            What should you do next?
          </h2>

          <div className="mt-5 space-y-4">
            <ActionItem
              number="1"
              text="Review your estimated investment and monthly expenses."
            />

            <ActionItem
              number="2"
              text="Compare the government schemes suggested for your business."
            />

            <ActionItem
              number="3"
              text="Prepare the documents required for the selected scheme."
            />

            <ActionItem
              number="4"
              text="Discuss the funding decision with a trusted financial or local support advisor."
            />
          </div>
        </section>

        <div className="mt-8">
          <Button className="w-full py-4">
            📄 Generate My Business Report
          </Button>
        </div>

        <p className="mt-4 text-center text-xs leading-5 text-slate-500">
          This advisory is intended for guidance and does not guarantee
          business success, scheme eligibility, loan approval, or financial
          outcomes.
        </p>
      </div>
    </main>
  )
}

function AdvisoryCard({ icon, title, value, description }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="text-3xl">{icon}</div>

      <h2 className="mt-4 font-semibold text-slate-900">{title}</h2>

      <p className="mt-1 text-lg font-bold text-green-700">{value}</p>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {description}
      </p>
    </div>
  )
}

function ActionItem({ number, text }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
        {number}
      </div>

      <p className="pt-1 leading-6 text-slate-600">{text}</p>
    </div>
  )
}

export default AdvisoryPage