from app.schemas.entrepreneur import EntrepreneurProfile
from app.services.scheme_service import match_schemes


def prepare_financial_inputs(profile: EntrepreneurProfile):
    return {
        "available_capital": profile.available_capital,
        "monthly_expenses": profile.monthly_expenses,
        "expected_monthly_revenue": profile.expected_monthly_revenue_after_3_months,
    }


def prepare_scheme_matches(profile: EntrepreneurProfile):
    return match_schemes(
        business_category=profile.business_type,
        state=profile.location,
    )