import { Link } from 'react-router-dom'
import Button from '../components/Button'

function ReportPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 print:bg-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between print:hidden">
          <Link
            to="/advisory"
            className="text-sm font-medium text-green-700 hover:text-green-800"
          >
            ← Back to Advisory
          </Link>

          <Button onClick={() => window.print()}>
            🖨️ Save / Print Report
          </Button>
        </div>

        <header className="rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-green-600">
            Business Advisory Report
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Your Personalized Business Plan
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            A simple summary of your business opportunity, financial position,
            funding options, scheme matches, and recommended next steps.
          </p>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Entrepreneur Profile
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <InfoItem label="Name" value="Ramesh Kumar" />
            <InfoItem label="District" value="Meerut" />
            <InfoItem label="State" value="Uttar Pradesh" />
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Business Summary
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <InfoItem label="Business" value="Ramesh Dairy Farm" />
            <InfoItem label="Business Type" value="Dairy" />
            <InfoItem label="Experience" value="1–3 years" />
            <InfoItem label="Stage" value="Already running" />
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Local Market
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <InfoItem label="Location" value="Khera" />
            <InfoItem label="Main Market" value="Village / Local area" />
            <InfoItem label="Customers" value="Local families" />
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Financial Summary
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <SummaryCard
              title="Total Investment"
              value="₹4,00,000"
            />

            <SummaryCard
              title="Own Contribution"
              value="₹1,50,000"
            />

            <SummaryCard
              title="Estimated Funding Gap"
              value="₹2,50,000"
            />

            <SummaryCard
              title="Monthly Surplus"
              value="₹20,000"
            />
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Recommended Government Schemes
          </h2>

          <div className="mt-5 space-y-4">
            <SchemeItem
              name="PMEGP"
              match="High Match"
              description="May be relevant for eligible micro-enterprise expansion and funding."
            />

            <SchemeItem
              name="MUDRA"
              match="Good Match"
              description="May support eligible small business working or expansion capital."
            />

            <SchemeItem
              name="PMFME"
              match="Possible Match"
              description="Relevant mainly if the business includes eligible food processing or value addition."
            />
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            AI Advisory
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <SummaryCard
              title="Business Opportunity"
              value="Promising"
            />

            <SummaryCard
              title="Risk Level"
              value="Moderate"
            />
          </div>

          <p className="mt-5 leading-7 text-slate-600">
            Grow gradually, monitor monthly income and expenses, and compare
            eligible government support before taking additional borrowing.
            Expansion should be supported by stable cash flow and manageable
            repayment obligations.
          </p>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Recommended Action Plan
          </h2>

          <div className="mt-5 space-y-4">
            <ActionItem
              number="1"
              text="Review your investment requirement and monthly expenses."
            />

            <ActionItem
              number="2"
              text="Compare the suggested government schemes and their official eligibility requirements."
            />

            <ActionItem
              number="3"
              text="Prepare the documents required for the selected support option."
            />

            <ActionItem
              number="4"
              text="Confirm repayment affordability before taking additional debt."
            />
          </div>
        </section>

        <footer className="mt-8 rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm leading-6 text-slate-500">
            This report provides preliminary business guidance. Final scheme
            eligibility, loan approval, and financial outcomes depend on
            official rules and individual circumstances.
          </p>
        </footer>
      </div>
    </main>
  )
}

function InfoItem({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function SummaryCard({ title, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-5">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-green-700">{value}</p>
    </div>
  )
}

function SchemeItem({ name, match, description }) {
  return (
    <div className="rounded-xl bg-slate-50 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-bold text-slate-900">{name}</h3>

        <span className="w-fit rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
          {match}
        </span>
      </div>

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

export default ReportPage