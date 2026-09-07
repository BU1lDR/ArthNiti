from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_scheme_match_route():
    response = client.post(
        "/api/schemes/match",
        json={
            "business_category": "dairy",
            "state": "Uttar Pradesh"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True

    # Asserted by lookup rather than by position. This used to pin
    # matches[0] == PMMY and count == 1, which stopped being true the moment
    # schemes.json grew past three rows -- and a test that has to be edited
    # every time a scheme is added was pinning the file, not the behaviour.
    assert data["count"] == len(data["matches"])
    assert data["count"] > 1

    names = [match["name"] for match in data["matches"]]
    assert "Pradhan Mantri MUDRA Yojana (PMMY)" in names

    pmmy = next(
        match
        for match in data["matches"]
        if match["name"] == "Pradhan Mantri MUDRA Yojana (PMMY)"
    )

    # 90, not 100: PMMY is open across India rather than run for this one
    # state, and the two score differently on purpose.
    assert pmmy["match_score"] == 90
    assert pmmy["level"] == "central"


def test_scheme_match_route_no_match():
    response = client.post(
        "/api/schemes/match",
        json={
            "business_category": "space tourism",
            "state": "Uttar Pradesh"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True
    assert data["count"] == 0
    assert data["matches"] == []