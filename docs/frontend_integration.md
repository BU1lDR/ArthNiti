# Frontend Integration Contract

## Base URL

Local development:

`http://localhost:8000`

## Unified Analysis API

### Endpoint

`POST /api/analysis/run`

Full URL:

`http://localhost:8000/api/analysis/run`

### Request Body

```json
{
  "business_category": "dairy",
  "state": "Delhi",
  "available_capital": 500000,
  "monthly_expenses": 30000,
  "expected_monthly_revenue": 60000,
  "monthly_emi": 10000,
  "initial_investment": 300000,
  "monthly_operating_expenses": 30000,
  "employees": 2,
  "existing_debt": 50000
}
```

## Required Fields

- `business_category` — string, minimum 2 characters
- `state` — string, minimum 2 characters
- `available_capital` — number, minimum 0
- `monthly_expenses` — number, minimum 0
- `expected_monthly_revenue` — number, minimum 0
- `monthly_emi` — number, minimum 0
- `initial_investment` — number, minimum 0
- `monthly_operating_expenses` — number, minimum 0

## Optional Fields

- `employees` — integer, default 0, minimum 0
- `existing_debt` — number, default 0, minimum 0

## Response Structure

A successful response contains five top-level sections:

```json
{
  "financial_analysis": {},
  "risk_analysis": {},
  "business_analysis": {},
  "scheme_matches": [],
  "advisory": {}
}
```

## Validation Errors

Invalid requests return HTTP `422`.

Validation includes:

- Missing required fields
- Negative financial values
- Negative EMI
- Negative debt
- Negative employee count
- Business category shorter than 2 characters
- State shorter than 2 characters
- Empty request body
- Malformed JSON

## CORS

Allowed frontend development origins:

- `http://localhost:3000`
- `http://localhost:5173`

## API Documentation

- Swagger UI: `http://localhost:8000/docs`
- OpenAPI: `http://localhost:8000/openapi.json`
- ReDoc: `http://localhost:8000/redoc`

## Backend Server

From the `backend` directory:

```powershell
uvicorn app.main:app --reload
```

## Frontend Request Example

```javascript
const response = await fetch("http://localhost:8000/api/analysis/run", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    business_category: "dairy",
    state: "Delhi",
    available_capital: 500000,
    monthly_expenses: 30000,
    expected_monthly_revenue: 60000,
    monthly_emi: 10000,
    initial_investment: 300000,
    monthly_operating_expenses: 30000,
    employees: 2,
    existing_debt: 50000
  })
});

const data = await response.json();
```

## Integration Notes

- Send JSON with `Content-Type: application/json`.
- Use `POST` for the unified analysis endpoint.
- Handle HTTP `422` as a validation error.
- Treat financial, risk, business, scheme, and advisory sections independently in the UI.
- Frontend code should depend on the API contract, not internal backend services.
