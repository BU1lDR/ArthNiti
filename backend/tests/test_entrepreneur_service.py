from app.schemas.entrepreneur import EntrepreneurProfile
from app.services.entrepreneur_service import (
    prepare_financial_inputs,
    prepare_scheme_matches,
)


def test_prepare_financial_inputs():

    profile = EntrepreneurProfile(
        name="Ramesh Kumar",
        location="Lucknow",
        business_type="Dairy",
        available_capital=50000,
        monthly_expenses=20000,
        expected_monthly_revenue_after_3_months=35000,
        goals="Expand dairy business"
    )

    result = prepare_financial_inputs(profile)

    assert result["available_capital"] == 50000
    assert result["monthly_expenses"] == 20000
    assert result["expected_monthly_revenue"] == 35000
def test_prepare_scheme_matches():

    profile = EntrepreneurProfile(
        name="Ramesh Kumar",
        location="Uttar Pradesh",
        business_type="Dairy",
        available_capital=50000,
        monthly_expenses=20000,
        expected_monthly_revenue_after_3_months=35000,
        goals="Expand dairy business"
    )

    result = prepare_scheme_matches(profile)

    assert len(result) > 0
    assert result[0]["name"]
    assert result[0]["match_score"] > 0   