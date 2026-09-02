from app.services.mvp_service import build_mvp_summary


def test_positive_business_generates_good_status():
    result = build_mvp_summary(
        financial_analysis={
            "financial_status": "profitable",
        },
        risk_analysis={
            "risk_level": "low",
        },
        business_analysis={
            "feasibility_status": "feasible",
        },
        advisory={
            "recommendations": [
                "Maintain the current business model."
            ],
        },
    )

    assert result["status"] == "good"
    assert result["priority"] == "low"


def test_high_risk_generates_attention_needed():
    result = build_mvp_summary(
        financial_analysis={
            "financial_status": "profitable",
        },
        risk_analysis={
            "risk_level": "high",
        },
        business_analysis={
            "feasibility_status": "feasible",
        },
        advisory={
            "recommendations": [],
        },
    )

    assert result["status"] == "attention_needed"
    assert result["priority"] == "high"
    assert "repayment" in result["next_step"].lower()


def test_unprofitable_business_generates_high_priority():
    result = build_mvp_summary(
        financial_analysis={
            "financial_status": "loss",
        },
        risk_analysis={
            "risk_level": "low",
        },
        business_analysis={
            "feasibility_status": "feasible",
        },
        advisory={
            "recommendations": [],
        },
    )

    assert result["priority"] == "high"
    assert result["status"] == "review"


def test_infeasible_business_generates_review_action():
    result = build_mvp_summary(
        financial_analysis={
            "financial_status": "profitable",
        },
        risk_analysis={
            "risk_level": "low",
        },
        business_analysis={
            "feasibility_status": "not_feasible",
        },
        advisory={
            "recommendations": [],
        },
    )

    assert result["priority"] == "medium"
    assert "business plan" in result["next_step"].lower()


def test_language_and_accessibility_context_is_preserved():
    result = build_mvp_summary(
        financial_analysis={
            "financial_status": "profitable",
        },
        risk_analysis={
            "risk_level": "low",
        },
        business_analysis={
            "feasibility_status": "feasible",
        },
        advisory={
            "recommendations": [],
        },
        user_language="Hindi",
        preferred_dialect="Haryanvi",
        literacy_level="low",
    )

    assert result["language"] == "Hindi"
    assert result["preferred_dialect"] == "Haryanvi"
    assert result["literacy_level"] == "low"
