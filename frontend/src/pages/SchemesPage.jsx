import { Link } from 'react-router-dom'
import Button from '../components/Button'

function SchemesPage() {
  const schemes = [
    {
      name: 'PMEGP',
      type: 'Business Loan + Subsidy',
      match: 'High Match',
      description:
        'Useful for eligible entrepreneurs starting or expanding a micro-enterprise.',
      reason: 'Your business stage and funding requirement may fit this support.',
    },
    {
      name: 'MUDRA',
      type: 'Micro Business Loan',
      match: 'Good Match',
      description:
        'Designed to support small businesses and micro-enterprises with business funding.',
      reason: 'Suitable for businesses looking for structured working or expansion capital.',
    },
    {
      name: 'PMFME',
      type: 'Food Processing Support',
      match: 'Possible Match',
      description:
        'Can support eligible micro food-processing enterprises with financial assistance.',
      reason: 'Relevant if your business involves food processing or value addition.',
    },
  ]

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/finance"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back
        </Link>

        <div className="mt-8">
          <p className="text-sm font-semibold text-green-600">Step 6 of 6</p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Government Scheme Matching
          </h1>

          <p className="mt-3 max-w-2xl text-slate-600">
            Based on your business profile and financial requirements, these
            schemes may be relevant to you.
          </p>
        </div>

        <div className="mt-8 space-y-5">
          {schemes.map((scheme) => (
            <SchemeCard key={scheme.name} scheme={scheme} />
          ))}
        </div>

        <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Important
          </h2>

          <p className="mt-3 leading-7 text-slate-600">
            Scheme matching is an initial guidance step. Final eligibility
            depends on official scheme rules, documents, location, business
            category, and other requirements.
          </p>
        </div>

        <div className="mt-8">
          <Link to="/advisory">
            <Button className="w-full py-4">
              View My Business Advisory →
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}

function SchemeCard({ scheme }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {scheme.name}
          </h2>

          <p className="mt-1 text-sm font-medium text-slate-500">
            {scheme.type}
          </p>
        </div>

        <span className="w-fit rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
          {scheme.match}
        </span>
      </div>

      <p className="mt-4 leading-7 text-slate-600">
        {scheme.description}
      </p>

      <div className="mt-4 rounded-xl bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-800">
          Why it may match
        </p>

        <p className="mt-1 text-sm leading-6 text-slate-600">
          {scheme.reason}
        </p>
      </div>
    </div>
  )
}

export default SchemesPage