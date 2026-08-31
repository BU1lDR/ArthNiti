from app.services.scheme_service import match_schemes


def test_dairy_matches_mudra():
    results = match_schemes(
        business_category="dairy",
        state="Uttar Pradesh"
    )

    assert len(results) > 0
    assert results[0]["name"] == "Pradhan Mantri MUDRA Yojana (PMMY)"
    assert results[0]["match_score"] == 100


def test_food_processing_matches_pmfme():
    results = match_schemes(
        business_category="food processing",
        state="Uttar Pradesh"
    )

    assert len(results) > 0
    assert (
        results[0]["name"]
        == "Pradhan Mantri Formalisation of Micro Food Processing Enterprises (PMFME)"
    )
    assert results[0]["match_score"] == 100


def test_manufacturing_matches_pmegp():
    results = match_schemes(
        business_category="manufacturing",
        state="Uttar Pradesh"
    )

    assert len(results) > 0
    assert (
        results[0]["name"]
        == "Prime Minister's Employment Generation Programme (PMEGP)"
    )


def test_unsupported_business_returns_no_matches():
    results = match_schemes(
        business_category="space tourism",
        state="Uttar Pradesh"
    )

    assert results == []


def test_matching_is_case_insensitive():
    results = match_schemes(
        business_category="DAIRY",
        state="UTTAR PRADESH"
    )

    assert len(results) > 0
    assert results[0]["match_score"] == 100