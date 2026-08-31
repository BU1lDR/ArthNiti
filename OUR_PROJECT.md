# SIH_2026 — Rural Business Copilot
## Common AI Memory / Team Project Context

> **Purpose:** This file is the single shared context document for all team members and their AI assistants.  
> **Rule:** Update this file whenever a major project decision changes. Do not let different AI chats invent conflicting architecture, features, or terminology.

---

# 1. Project Identity

## Working Project Name
To be decided...

## Proposed SIH Problem Statement
**AI-Powered Hyperlocal Business and Financial Advisory Platform for Rural Micro-Entrepreneurs**

Alternative title:
**AI-Driven Hyperlocal Decision Support and Financial Planning System for Rural Micro-Enterprises**

## One-Line Pitch
> An AI-powered rural business copilot that understands an entrepreneur's local market, business economics, and financial situation, then converts them into a personalized, explainable, and actionable business-growth and financing plan.

## Core Idea
We are NOT building a generic AI chatbot.

We are building a prototype that helps a rural micro-entrepreneur answer:

1. What business should I pursue?
2. Is my business idea financially viable?
3. What does my local market look like?
4. How much money do I need?
5. How much should come from my own capital?
6. How much external financing may be appropriate?
7. Which government/financial-support schemes may be relevant?
8. Can I safely afford the proposed repayment?
9. What documents/information do I need?
10. What should I do next?

---

# 2. Core Product Philosophy

## The product should feel like:
**"A digital business advisor for a rural entrepreneur."**

## It should NOT feel like:
- ChatGPT with a rural-themed UI
- A static government-scheme directory
- A loan calculator only
- A generic business-plan generator
- A dashboard full of fake data

## Key Differentiators
1. **Hyperlocal** — location-aware recommendations.
2. **Personalized** — based on entrepreneur profile and business details.
3. **Financially structured** — converts business needs into a funding plan.
4. **Explainable** — shows why a recommendation was made.
5. **Actionable** — ends with concrete next steps.
6. **Regional-language/voice ready** — prototype can prioritize Hindi + English if time permits.
7. **Responsible** — does not blindly recommend borrowing; can flag when borrowing appears risky.

---

# 3. Prototype Scope for 10 Days

## MVP Objective

A judge should be able to enter a realistic rural entrepreneur profile and receive an end-to-end advisory result in a few minutes.

### Required MVP Flow

```text
Landing Page
    ↓
Entrepreneur Profile
    ↓
Business Information
    ↓
Location / Local Context
    ↓
AI Business Analysis
    ↓
Financial Calculation
    ↓
Funding Structure
    ↓
Scheme/Support Matching
    ↓
Risk + Explainability
    ↓
Personalized Action Plan
    ↓
Download/Save Report
```

## Recommended MVP Demo Persona

Use ONE polished demo persona for the internal hackathon.

Example:
- Location: rural Uttar Pradesh
- Entrepreneur: first-time / small existing entrepreneur
- Business: dairy
- Own capital: ₹1.5 lakh
- Total investment requirement: ₹4 lakh
- Existing monthly income: ₹25,000
- Experience: 3 years

The exact numbers can be changed later.

---

# 4. Main Features

## Feature 1 — Entrepreneur Profile
Inputs:
- Name
- Age range
- Gender (optional)
- Village/town
- District
- State
- Existing/new entrepreneur
- Experience
- Available capital
- Preferred language

## Feature 2 — Business Profile
Inputs:
- Business category
- Business idea
- Existing/recommended business
- Initial investment
- Monthly expected sales
- Monthly operating expenses
- Number of employees
- Expected growth
- Existing debt

## Feature 3 — Hyperlocal Context
Prototype options:
- State/district
- Local market type
- Nearby market/buyer information
- Indicative local prices
- Seasonal considerations

For the 10-day prototype, use a small curated dataset rather than attempting a nationwide real-time data platform.

## Feature 4 — Business Feasibility Engine

Calculate:
- Revenue
- Operating expenses
- Gross profit
- Net operating surplus
- Gross margin
- Break-even point
- ROI/return estimate
- Cash-flow estimate

Use deterministic formulas for calculations.

Do NOT ask the LLM to perform critical arithmetic when code can calculate it.

## Feature 5 — Financial Structuring Engine

Example:

```text
Total investment              ₹4,00,000
Entrepreneur contribution     ₹1,50,000
External funding requirement  ₹2,50,000
```

Then evaluate:
- Funding gap
- Suggested financing range
- Indicative EMI scenarios
- Cash-flow coverage
- Repayment stress

Important:
The system is a decision-support prototype, not a lender and not a financial guarantee engine.

## Feature 6 — Scheme Matching

Create a small verified prototype dataset containing selected relevant government/financial-support schemes.

Suggested fields:
- Scheme name
- Target users
- Business categories
- Geography
- Eligibility rules
- Loan/subsidy/support type
- Indicative amount/range if applicable
- Required documents
- Official source
- Last verified date

The AI should match the entrepreneur to this structured data.

## Feature 7 — Explainability

Every important recommendation should have a "Why?" explanation.

Example:

```text
Recommended external funding: ₹2.5 lakh

Why?
- Total business requirement: ₹4 lakh
- Own contribution: ₹1.5 lakh
- Estimated monthly surplus: ₹21,000
- Indicative safe repayment range: below ₹9,000/month

Therefore, the prototype flags larger borrowing as potentially stressful.
```

## Feature 8 — Risk Indicator

Possible output:
- Low risk
- Moderate risk
- High repayment pressure

The risk result should be based on transparent prototype rules.

Example:
```text
EMI / Monthly Surplus < 30%  → Lower pressure
30–50%                      → Moderate pressure
>50%                        → High pressure
```

These thresholds are prototype assumptions and must be labeled as such, not presented as universal financial rules.

## Feature 9 — Action Plan

Example:
1. Verify local supplier prices.
2. Confirm expected buyer demand.
3. Prepare business documents.
4. Validate scheme eligibility.
5. Generate business report.
6. Approach the appropriate official channel.
7. Recalculate financing after obtaining actual quotations.

## Feature 10 — AI Chat Assistant

The chat should NOT be the main product.

It should allow questions such as:
- "Why is my loan requirement this high?"
- "How can I reduce my initial investment?"
- "What documents do I need?"
- "Why was this scheme recommended?"
- "What happens if my sales are 20% lower?"

The assistant should use the user's structured profile and calculated outputs as context.

---

# 5. What NOT to Build in the 10-Day Prototype

Avoid:
- Nationwide real-time market intelligence
- Full banking integration
- Actual loan applications
- Real-time credit scoring
- Aadhaar/PAN verification
- Complex ML models without useful data
- Mobile app + web app simultaneously
- Large-scale multilingual voice system
- Scraping hundreds of websites
- Fully autonomous financial decisions
- Production-grade authentication
- Blockchain
- Microservices unless genuinely necessary

The goal is a **convincing, functional MVP**, not a production platform.

---

# 6. Recommended Technical Architecture

## Frontend
Choose one stack and freeze it on Day 1.

Recommended:
- React
- Vite
- Tailwind CSS
- Recharts or another simple chart library

Alternative if the team is already stronger in another stack:
- Next.js
- React + plain CSS

Do not switch frameworks during the 10-day sprint.

## Backend
Recommended:
- Python
- FastAPI

Responsibilities:
- API endpoints
- Input validation
- Business calculations
- Financial calculations
- Scheme matching
- AI orchestration
- Report generation
- Optional database access

## Database
For a 10-day prototype:
- SQLite or PostgreSQL

Suggested entities:
- Entrepreneur
- BusinessProfile
- MarketData
- Scheme
- FinancialProjection
- AdvisoryReport

If persistence is not necessary for the demo, JSON/SQLite can be enough.

## AI Layer
Use an LLM API through the backend.

AI responsibilities:
- Understand natural-language business descriptions
- Ask missing questions
- Explain calculations
- Summarize local/business context
- Generate recommendations
- Generate action plans

Deterministic backend responsibilities:
- Arithmetic
- Financial formulas
- Eligibility rules where possible
- Risk calculations
- Data retrieval

---

# 7. Suggested API Design

## POST /api/profile
Create/update entrepreneur profile.

## POST /api/business/analyze
Input:
- entrepreneur profile
- business data
- location

Output:
- feasibility metrics
- key observations

## POST /api/finance/structure
Input:
- total investment
- own capital
- expected cash flow
- existing debt
- financing assumptions

Output:
- funding gap
- financing scenarios
- repayment metrics
- risk indicator

## POST /api/schemes/match
Input:
- location
- business category
- entrepreneur characteristics
- funding requirement

Output:
- matched schemes
- match reasons
- eligibility checklist
- official sources

## POST /api/advisory/generate
Combines all structured outputs and asks the LLM to generate:
- executive summary
- recommendations
- explanations
- risks
- action plan

## POST /api/chat
Context-aware conversational assistant.

## GET /api/report/{id}
Retrieve generated report.

---

# 8. Suggested Data Model

## Entrepreneur
```text
id
name
state
district
village
experience_years
available_capital
language
```

## BusinessProfile
```text
id
entrepreneur_id
business_type
description
initial_investment
expected_monthly_revenue
monthly_expenses
employees
existing_debt
```

## Scheme
```text
id
name
description
target_segment
business_categories
states
eligibility_rules
support_type
documents
official_url
last_verified
```

## MarketData
```text
id
state
district
business_category
indicative_price
demand_indicator
seasonality
source
last_verified
```

## AdvisoryReport
```text
id
entrepreneur_id
feasibility_score
funding_requirement
risk_level
matched_schemes
recommendations
action_plan
created_at
```

---

# 9. Financial Calculation Concepts

## Revenue
```text
Monthly Revenue =
Units Sold × Selling Price
```

## Gross Profit
```text
Gross Profit =
Revenue − Variable Costs
```

## Operating Surplus
```text
Operating Surplus =
Revenue − Total Operating Expenses
```

## Funding Gap
```text
Funding Gap =
Total Initial Requirement − Own Contribution
```

## Simplified Break-Even
```text
Break-Even Units =
Fixed Costs / (Selling Price − Variable Cost per Unit)
```

## Simplified ROI
```text
ROI =
Annual Net Return / Initial Investment × 100
```

## Repayment Pressure
Use a clearly labeled prototype indicator based on:
```text
Repayment Pressure =
Indicative EMI / Monthly Operating Surplus
```

All formulas should be implemented in backend code and unit-tested.

---

# 10. Team Structure

## Saad — Presentation / Product Story
Responsibilities:
- Problem statement
- User personas
- Solution narrative
- SIH pitch
- Judge-facing demo script
- PPT
- Final storytelling
- Research/source tracking with Tripti

## Tripti — Presentation / Research
Responsibilities:
- Problem research
- Government/scheme research
- Competitive analysis
- Sources and citations
- PPT support
- Demo narration
- Validation of claims
- Final documentation

## Netra — Frontend
Responsibilities:
- UI architecture
- Landing page
- Profile/business forms
- Navigation
- Dashboard
- Charts
- Responsive design
- API integration

## Anmol — Frontend
Responsibilities:
- Component development
- Advisory results page
- Scheme cards
- Chat UI
- Action-plan UI
- Loading/error states
- Frontend testing
- UI polish

## Aryan — Backend
Responsibilities:
- FastAPI setup
- API design
- Business calculations
- Financial engine
- Validation
- AI integration
- Backend testing

## Manjeet — Backend
Responsibilities:
- Database/data layer
- Scheme matching
- Market dataset
- AI context pipeline
- Report generation
- Backend integration
- API testing

## Cross-team rule
Nobody works in isolation for 10 days.

Every day:
- 15-minute stand-up
- 1 shared task board
- 1 shared Git repository
- 1 integration checkpoint
- End-of-day update

---

# 11. Git / Collaboration Rules

Suggested branches:
```text
main
develop
frontend/netra
frontend/anmol
backend/aryan
backend/manjeet
```

Rules:
1. Never directly push unfinished work to `main`.
2. Make small commits.
3. Pull/rebase before major merges.
4. Every PR should explain what changed.
5. Keep `.env` secrets out of Git.
6. Maintain a `.env.example`.
7. Never commit API keys.
8. Merge into `develop` frequently.
9. Integrate frontend/backend by Day 4–5, not Day 9.

---

# 12. 10-Day Development Plan

## DAY 1 — Freeze Scope + Setup

### Whole team
- Freeze product name.
- Freeze MVP features.
- Freeze tech stack.
- Define demo persona.
- Create Git repository.
- Create task board.
- Define API contract.
- Decide visual identity.

### Saad + Tripti
- Finalize problem statement.
- Define user pain points.
- Research credible statistics.
- Identify 3–5 relevant official schemes.
- Start PPT skeleton.

### Netra + Anmol
- Create React/Vite project.
- Build design system.
- Create routing/navigation.
- Build landing page skeleton.

### Aryan + Manjeet
- Create FastAPI project.
- Create folder structure.
- Create initial endpoints.
- Define calculation functions.
- Create initial scheme JSON/DB dataset.

### Day 1 Deliverable
A runnable skeleton:
```text
Frontend runs.
Backend runs.
Git works.
Basic pages exist.
API contract is written.
MVP is frozen.
```

---

## DAY 2 — Core UI + Backend Foundations

### Frontend
Build:
- Landing
- Profile form
- Business form
- Basic dashboard shell

### Backend
Build:
- Profile API
- Business API
- Validation
- Financial calculation module

### Research
- Verify scheme information.
- Collect official source URLs.
- Define market-data assumptions.

### Day 2 Deliverable
User can enter profile/business information and send it to backend.

---

## DAY 3 — Financial Engine + First Real Data

### Backend
Implement:
- Revenue
- Expenses
- Profit/surplus
- Break-even
- ROI
- Funding gap
- Repayment scenario
- Risk indicator

### Frontend
Display:
- Revenue
- Expenses
- Profit
- Funding requirement
- Risk card
- Charts

### Research
Create a small curated dataset.

### Day 3 Deliverable
**The financial dashboard works without AI.**

---

## DAY 4 — Scheme Matching + Local Context

### Backend
Implement:
- Scheme database
- Rule-based filtering
- Match score
- Match explanation

### Frontend
Build:
- Scheme cards
- Eligibility checklist
- Why matched?
- Official-source button

### Important
Use verified official sources for government claims.

### Day 4 Deliverable
A user can receive relevant scheme suggestions from structured data.

---

## DAY 5 — AI Integration

### Backend
Connect LLM.

AI pipeline:
```text
Structured User Data
        +
Calculated Financial Data
        +
Scheme Matches
        +
Local Context
        ↓
      LLM
        ↓
Advisory Explanation
```

AI output should be structured JSON where possible.

### Frontend
Add:
- AI summary
- Recommendations
- Explainability
- Chat interface skeleton

### Day 5 Deliverable
**Full happy-path prototype works end-to-end.**

This is the most important milestone.

---

## DAY 6 — Hyperlocal + Personalization

Improve:
- Location-aware content
- Local business context
- Personalized language
- Business-category-specific recommendations
- Seasonal observations where data supports them

Add 2–3 business categories:
- Dairy
- Food processing
- Rural services/retail

### Day 6 Deliverable
The system feels meaningfully different for different users/businesses.

---

## DAY 7 — UX + Explainability + Responsible AI

Add:
- Why recommendation?
- Why funding amount?
- Why scheme?
- Risk explanation
- Assumptions
- Data-source labels
- Disclaimer

Potential disclaimer:
> This prototype provides decision-support and educational information. Financing eligibility, interest rates, scheme availability and approval are determined by the relevant institution/authority.

### Day 7 Deliverable
The system is understandable and defensible in front of judges.

---

## DAY 8 — Testing + Demo Scenario

### Whole team
Run:
- Happy-path test
- Invalid-input test
- API failure test
- Empty data test
- Mobile/responsive test
- AI failure test
- Calculation verification

Create 2–3 demo scenarios:
1. Strong candidate
2. Moderate candidate
3. High repayment-risk candidate

### Day 8 Deliverable
A reliable demo and bug list.

---

## DAY 9 — Polish + Presentation

### Developers
- Fix critical bugs only.
- Improve loading states.
- Improve charts.
- Improve spacing/typography.
- Add error handling.
- Seed demo data.
- Make demo deterministic.

### Saad + Tripti
Finalize:
- Problem
- Existing gap
- Solution
- Architecture
- Innovation
- Impact
- Feasibility
- Future scope
- Demo script

### Day 9 Deliverable
Feature freeze.

No major new features after this point.

---

## DAY 10 — Rehearsal + Final Build

### Morning
- Full system test
- Clean database/demo data
- Verify environment variables
- Build production frontend
- Verify backend
- Test on presentation laptop

### Afternoon
Conduct 3 complete rehearsals.

### Final demo sequence
```text
1. Introduce rural entrepreneur problem
2. Enter entrepreneur profile
3. Enter business
4. Show financial feasibility
5. Show hyperlocal insight
6. Show funding structure
7. Show scheme matching
8. Ask "Why?"
9. Show risk
10. Show action plan
11. End with impact
```

### Day 10 Deliverable
**Stable, rehearsed, presentation-ready prototype.**

---

# 13. Definition of Done

The MVP is considered complete when:

- [ ] Frontend runs reliably.
- [ ] Backend runs reliably.
- [ ] Profile input works.
- [ ] Business input works.
- [ ] Financial calculations work.
- [ ] Funding gap works.
- [ ] Risk indicator works.
- [ ] Scheme matching works.
- [ ] AI advisory works.
- [ ] Explainability works.
- [ ] Action plan works.
- [ ] At least 2–3 business categories work.
- [ ] At least one polished demo persona works.
- [ ] Error states exist.
- [ ] API keys are protected.
- [ ] Sources are recorded.
- [ ] Presentation is complete.
- [ ] Demo has been rehearsed at least 3 times.

---

# 14. Suggested Repository Structure

```text
rural-business-copilot/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   └── utils/
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── calculations/
│   │   ├── ai/
│   │   └── data/
│   ├── tests/
│   └── requirements.txt
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── sources.md
│   └── demo-script.md
│
├── .env.example
├── README.md
└── PROJECT_MEMORY.md
```

---

# 15. AI Prompting Strategy

## System role
The AI is a rural micro-enterprise advisory assistant.

It must:
- use provided structured data;
- distinguish facts from assumptions;
- never invent scheme eligibility;
- explain recommendations;
- avoid guaranteeing loans/profits;
- use deterministic financial outputs provided by backend;
- recommend verification for important claims;
- answer in simple language.

## Context supplied to AI
```text
Entrepreneur profile
Business profile
Location
Calculated financial metrics
Risk result
Matched schemes
Market data
Assumptions
```

## Preferred response structure
```json
{
  "summary": "...",
  "key_insights": [],
  "financial_explanation": [],
  "scheme_explanation": [],
  "risks": [],
  "actions": []
}
```

---

# 16. Presentation Structure

Recommended 8–10 slide deck:

1. **Title**
2. **Problem**
3. **Who is affected?**
4. **Current gap**
5. **Our solution**
6. **How it works**
7. **Innovation / USP**
8. **Technology architecture**
9. **Impact + scalability**
10. **Demo / future vision**

## Key message
Do not spend most of the presentation explaining technology.

Spend more time showing:
**problem → insight → solution → demo → impact.**

---

# 17. Judge Questions to Prepare For

## "Why AI?"
Answer:
AI makes the system conversational, personalized, multilingual, and capable of translating complex financial/business information into understandable advice. Calculations and rule-based eligibility are handled deterministically.

## "Why is this different from ChatGPT?"
Answer:
The system combines structured entrepreneur data, hyperlocal context, deterministic financial calculations, scheme matching, explainability, and an actionable workflow.

## "How do you prevent hallucinations?"
Answer:
Critical numerical outputs are generated by deterministic backend functions. Scheme information comes from a structured verified dataset with official sources. The LLM explains and orchestrates rather than inventing financial calculations.

## "Can this replace banks or financial advisors?"
Answer:
No. It is decision-support and financial-literacy assistance, not a lender or approval authority.

## "How do you scale?"
Answer:
Expand verified datasets, business categories, states/languages, local data sources, and integrations while keeping the same advisory engine.

## "What happens if the user should not borrow?"
Answer:
The system can flag repayment pressure and recommend reducing investment, increasing own contribution, or delaying borrowing instead of automatically recommending a loan.

## "Where does local data come from?"
Answer:
For the prototype, curated and source-attributed datasets. In a larger deployment, integrate verified government/open-data/market sources and authorized data providers.

---

# 18. Product Success Metrics

For the prototype:
- Time to generate advisory plan
- Completion rate of user journey
- Accuracy of financial calculations
- Correctness of scheme matching
- Explanation quality
- Number of actionable recommendations
- Demo success/reliability

For future production:
- Entrepreneurs assisted
- Business plans generated
- Financial-literacy improvement
- Successful formal-finance connections
- Business survival/growth indicators
- Reduction in inappropriate borrowing

---

# 19. Risk Register

## Risk: Scope explosion
Mitigation:
Freeze MVP on Day 1.

## Risk: AI hallucination
Mitigation:
RAG/structured data + deterministic calculations + source attribution.

## Risk: Incorrect financial advice
Mitigation:
Use transparent assumptions and decision-support framing; never guarantee outcomes.

## Risk: Bad government-scheme information
Mitigation:
Use official sources and record verification dates.

## Risk: Frontend/backend integration late
Mitigation:
First end-to-end integration by Day 5.

## Risk: Demo internet/API failure
Mitigation:
Prepare seeded/demo data and a fallback mode where feasible.

## Risk: Team members duplicate work
Mitigation:
Shared task board and daily stand-up.

## Risk: Developers ignore presentation
Mitigation:
Saad + Tripti start PPT on Day 1.

---

# 20. Daily Team Ritual

Every day:

### 15-minute stand-up
Each person answers:
1. What did I finish?
2. What am I doing today?
3. What is blocking me?

### End-of-day
Update:
```text
DONE:
IN PROGRESS:
BLOCKED:
NEXT:
```

### Integration rule
At least once per day, frontend and backend members communicate directly about API contracts.

---

# 21. Prototype Data Strategy

Use a small, high-quality dataset instead of a huge low-quality dataset.

Example business categories:
```text
dairy
poultry
beekeeping
food processing
tailoring
mobile/repair services
small retail
```

Example local-data fields:
```text
location
business_category
indicative_input_cost
indicative_selling_price
demand_level
seasonality
source
last_verified
```

For demo purposes, clearly label indicative values as:
**"Prototype estimate / illustrative data"**
unless verified from a reliable source.

---

# 22. Future Scope

After the hackathon:
- More regional languages
- Voice-first interface
- Better local market data
- GIS/location intelligence
- Government/open-data integrations
- Financial-institution integrations
- Document OCR
- Business-plan PDF generation
- WhatsApp-style interface
- Offline/low-connectivity mode
- Personalized learning/financial-literacy modules
- Longitudinal business tracking
- Better forecasting models
- Human advisor escalation

---

# 23. Final Product Vision

```text
                 RURAL ENTREPRENEUR
                         ↓
             Voice / Text / Local Language
                         ↓
                 Entrepreneur Profile
                         ↓
                 Business Understanding
                         ↓
              ┌──────────┴──────────┐
              ↓                     ↓
       Hyperlocal Data        Financial Data
              ↓                     ↓
              └──────────┬──────────┘
                         ↓
                  ADVISORY ENGINE
                         ↓
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
      Business       Financial       Scheme
      Feasibility    Structuring     Matching
          ↓              ↓              ↓
          └──────────────┼──────────────┘
                         ↓
                Explainable Advice
                         ↓
                    Risk Check
                         ↓
                  Action Plan
                         ↓
             RURAL BUSINESS GROWTH
```

---

# 24. Team Decision Rules

When choosing between features:

1. Prefer features that directly solve the entrepreneur's problem.
2. Prefer deterministic calculations over AI-generated numbers.
3. Prefer verified data over impressive-looking fake data.
4. Prefer one polished workflow over many unfinished features.
5. Integrate early.
6. Never add a major feature after Day 8.
7. If a feature cannot be demonstrated clearly in under 60 seconds, question whether it belongs in the MVP.

---

# 25. Immediate Next Step

Before starting detailed implementation, the team should confirm:

- [ ] Project concept accepted.
- [ ] Project title selected.
- [ ] MVP scope accepted.
- [ ] Tech stack selected.
- [ ] Demo business/persona selected.
- [ ] Team responsibilities accepted.
- [ ] 10-day schedule accepted.

After confirmation, proceed through the project in this order:

**Step 1 → Product specification**
**Step 2 → Architecture**
**Step 3 → Database/data**
**Step 4 → Backend foundation**
**Step 5 → Financial engine**
**Step 6 → Scheme matching**
**Step 7 → AI layer**
**Step 8 → Frontend**
**Step 9 → Integration**
**Step 10 → Testing**
**Step 11 → Demo**
**Step 12 → Presentation**

---

# 26. AI Continuity Instructions

Any AI assistant reading this file should:

- Treat this document as the current project context.
- Preserve the team structure.
- Preserve the 10-day constraint.
- Avoid expanding scope without explicit team approval.
- Give implementation advice appropriate for a hackathon prototype.
- Clearly distinguish prototype assumptions from verified facts.
- Never invent government scheme details.
- Keep financial calculations deterministic.
- Prefer practical implementation over theoretical complexity.
- When suggesting code, specify the exact file/path where it belongs.
- When changing architecture, explain why and update this file.
- When a team member asks for help, connect the answer to their assigned responsibility.

---

# 27. Current Status

**Phase:** Planning / Blueprint

**Time available:** 10 days

**Team:** 6
- Saad — Presentation
- Tripti — Presentation
- Netra — Frontend
- Anmol — Frontend
- Aryan — Backend
- Manjeet — Backend

**MVP status:** Not started

**Architecture status:** Proposed

**Data status:** To be collected/verified

**AI integration:** To be implemented

**Presentation:** Initial structure only

**Next milestone:** Freeze scope and begin Day 1 setup
