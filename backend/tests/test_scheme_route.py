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
    assert data["count"] == 1
    assert (
        data["matches"][0]["name"]
        == "Pradhan Mantri MUDRA Yojana (PMMY)"
    )
    assert data["matches"][0]["match_score"] == 100


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