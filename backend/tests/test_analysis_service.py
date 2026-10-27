from app.services.analysis_service import run_unified_analysis


def test_unified_analysis_returns_all_sections():
    result = run_unified_analysis(
        business_category="Dairy",
        state="Delhi",
        available_capital=100000,
        monthly_expenses=30000,
        expected_monthly_revenue=50000,
        monthly_emi=10000,
        initial_investment=100000,
        monthly_operating_expenses=30000,
        existing_debt=0,
    )

    assert "financial_analysis" in result
    assert "risk_analysis" in result
    assert "business_analysis" in result
    assert "scheme_matches" in result
    assert "advisory" in result


def test_unified_analysis_financial_results_are_connected():
    result = run_unified_analysis(
        business_category="Dairy",
        state="Delhi",
        available_capital=100000,
        monthly_expenses=30000,
        expected_monthly_revenue=50000,
        monthly_emi=10000,
        initial_investment=100000,
        monthly_operating_expenses=30000,
    )

    financial = result["financial_analysis"]

    assert financial["monthly_profit"] == 20000
    assert financial["profit_margin_percent"] == 40
    assert financial["financial_status"] == "profitable"


def test_unified_analysis_risk_uses_financial_surplus():
    result = run_unified_analysis(
        business_category="Dairy",
        state="Delhi",
        available_capital=100000,
        monthly_expenses=30000,
        expected_monthly_revenue=50000,
        monthly_emi=10000,
        initial_investment=100000,
        monthly_operating_expenses=30000,
    )

    risk = result["risk_analysis"]

    assert risk["pressure_ratio_percent"] == 50
    assert risk["risk_level"] == "moderate"


def test_unified_analysis_business_section():
    result = run_unified_analysis(
        business_category="Dairy",
        state="Delhi",
        available_capital=100000,
        monthly_expenses=30000,
        expected_monthly_revenue=50000,
        monthly_emi=10000,
        initial_investment=100000,
        monthly_operating_expenses=30000,
    )

    business = result["business_analysis"]

    assert business["business_type"] == "Dairy"
    assert business["monthly_operating_surplus"] == 20000
    assert business["feasibility_status"] == "feasible"


def test_unified_analysis_advisory_uses_financial_status():
    result = run_unified_analysis(
        business_category="Dairy",
        state="Delhi",
        available_capital=100000,
        monthly_expenses=30000,
        expected_monthly_revenue=50000,
        monthly_emi=10000,
        initial_investment=100000,
        monthly_operating_expenses=30000,
    )

    recommendations = result["advisory"]["recommendations"]

    assert any("controlled expansion" in item for item in recommendations)
    assert any("healthy profit margin" in item for item in recommendations)


def test_unified_analysis_handles_loss_scenario():
    result = run_unified_analysis(
        business_category="Dairy",
        state="Delhi",
        available_capital=5000,
        monthly_expenses=40000,
        expected_monthly_revenue=30000,
        monthly_emi=5000,
        initial_investment=100000,
        monthly_operating_expenses=40000,
    )

    assert result["financial_analysis"]["financial_status"] == "loss"
    assert result["risk_analysis"]["risk_level"] == "high"
    assert result["business_analysis"]["feasibility_status"] == "not_feasible"

    recommendations = result["advisory"]["recommendations"]

    assert any("Reduce unnecessary" in item for item in recommendations)
    assert any("Improve the profit margin" in item for item in recommendations)
    assert any("cash reserve" in item for item in recommendations)


def test_unified_analysis_handles_break_even_scenario():
    result = run_unified_analysis(
        business_category="Retail",
        state="Delhi",
        available_capital=50000,
        monthly_expenses=30000,
        expected_monthly_revenue=30000,
        monthly_emi=5000,
        initial_investment=100000,
        monthly_operating_expenses=30000,
    )

    assert result["financial_analysis"]["financial_status"] == "break_even"
    assert result["business_analysis"]["feasibility_status"] == "break_even"

    recommendations = result["advisory"]["recommendations"]

    assert any("increasing revenue" in item for item in recommendations)
    assert any("Improve the profit margin" in item for item in recommendations)


def test_unified_analysis_returns_scheme_matches_as_list():
    result = run_unified_analysis(
        business_category="Dairy",
        state="Delhi",
        available_capital=100000,
        monthly_expenses=30000,
        expected_monthly_revenue=50000,
        monthly_emi=10000,
        initial_investment=100000,
        monthly_operating_expenses=30000,
    )

    assert isinstance(result["scheme_matches"], list)

    for scheme in result["scheme_matches"]:
        assert scheme["match_score"] > 0
        assert "name" in scheme
        assert "official_url" not in scheme


def test_unified_analysis_preserves_input_values():
    result = run_unified_analysis(
        business_category="Agriculture",
        state="Punjab",
        available_capital=123456.78,
        monthly_expenses=12345,
        expected_monthly_revenue=25000,
        monthly_emi=4000,
        initial_investment=75000,
        monthly_operating_expenses=12000,
        existing_debt=15000,
    )

    financial = result["financial_analysis"]
    business = result["business_analysis"]

    assert financial["available_capital"] == 123456.78
    assert business["business_type"] == "Agriculture"
    assert business["initial_investment"] == 75000
    assert business["expected_monthly_revenue"] == 25000
    assert business["monthly_operating_expenses"] == 12000


def test_every_fit_basis_is_reachable_through_the_real_pipeline():
    """
    fit_basis is what every scheme card is labelled with, so all three values
    have to come out of a real request, not just out of the scorer called by
    hand. Swept through run_unified_analysis rather than match_schemes for that
    reason.

    Uttar Pradesh tailoring is the documented demo case and carries "state" and
    "national" in one response (the two UP state schemes and ODOP name only
    Uttar Pradesh; PMMY, PMEGP and the rest are for every state). Assam carries
    "region", from UNNATI, which names all eight North-Eastern states. A state
    with no scheme of its own carries only "national", and the card must never
    claim otherwise.
    """
    common = dict(
        available_capital=50000,
        monthly_expenses=15000,
        expected_monthly_revenue=30000,
        monthly_emi=2000,
        initial_investment=100000,
        monthly_operating_expenses=18000,
        location_type="rural",
    )

    demo = run_unified_analysis(
        business_category="tailoring", state="Uttar Pradesh", **common
    )["scheme_matches"]

    assert {match["fit_basis"] for match in demo} == {"state", "national"}

    for match in demo:
        assert match["match_score"] == (100 if match["fit_basis"] == "state" else 90)

    north_east = run_unified_analysis(
        business_category="tailoring", state="Assam", **common
    )["scheme_matches"]

    assert {match["fit_basis"] for match in north_east} == {"region", "national"}

    for match in north_east:
        assert match["match_score"] == (100 if match["fit_basis"] == "region" else 90)

    elsewhere = run_unified_analysis(
        business_category="tailoring", state="Punjab", **common
    )["scheme_matches"]

    assert elsewhere
    assert {match["fit_basis"] for match in elsewhere} == {"national"}
