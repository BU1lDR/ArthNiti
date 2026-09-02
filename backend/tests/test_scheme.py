from app.services.scheme_service import (
    calculate_match_score,
    load_schemes,
    match_schemes,
)


def test_load_schemes():
    schemes = load_schemes()

    assert len(schemes) == 3
    assert all("name" in scheme for scheme in schemes)


def test_exact_category_match():
    schemes = load_schemes()

    pmmy = next(
        scheme
        for scheme in schemes
        if scheme["name"] == "Pradhan Mantri MUDRA Yojana (PMMY)"
    )

    score, reasons = calculate_match_score(
        scheme=pmmy,
        business_category="dairy",
        state="Uttar Pradesh",
    )

    assert score == 100
    assert len(reasons) == 2


def test_category_matching_is_case_insensitive():
    schemes = load_schemes()

    pmmy = next(
        scheme
        for scheme in schemes
        if scheme["name"] == "Pradhan Mantri MUDRA Yojana (PMMY)"
    )

    score, _ = calculate_match_score(
        scheme=pmmy,
        business_category="DAIRY",
        state="Uttar Pradesh",
    )

    assert score == 100


def test_category_matching_ignores_spaces():
    schemes = load_schemes()

    pmmy = next(
        scheme
        for scheme in schemes
        if scheme["name"] == "Pradhan Mantri MUDRA Yojana (PMMY)"
    )

    score, _ = calculate_match_score(
        scheme=pmmy,
        business_category="  dairy  ",
        state="Uttar Pradesh",
    )

    assert score == 100


def test_non_matching_category_returns_zero():
    schemes = load_schemes()

    pmmy = next(
        scheme
        for scheme in schemes
        if scheme["name"] == "Pradhan Mantri MUDRA Yojana (PMMY)"
    )

    score, reasons = calculate_match_score(
        scheme=pmmy,
        business_category="textile",
        state="Uttar Pradesh",
    )

    assert score == 0
    assert reasons == []


def test_match_schemes_returns_dairy_scheme():
    matches = match_schemes(
        business_category="dairy",
        state="Uttar Pradesh",
    )

    assert matches
    assert matches[0]["name"] == "Pradhan Mantri MUDRA Yojana (PMMY)"
    assert matches[0]["match_score"] == 100