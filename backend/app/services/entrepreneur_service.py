from app.schemas.entrepreneur import EntrepreneurProfile


def prepare_financial_inputs(profile: EntrepreneurProfile):
    return {
        "available_capital": profile.available_capital,
        "monthly_expenses": profile.monthly_expenses,
        "expected_monthly_revenue": profile.expected_monthly_revenue_after_3_months,
    }