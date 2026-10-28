# What a scheme asks the reader to put in, what it pays, and what is left to
# borrow, worked out from the terms each scheme publishes. There is no model and
# no judgement here: it is arithmetic on three small tables, and each table says
# where its figures came from.
#
# Nothing here says a scheme is open, or that a bank or an agency will approve
# anyone. The terms change, and each entry carries a `terms` code so the page can
# say which published document it is reading from. Who is eligible is not
# evaluated anywhere in this app (sc.eligUnchecked says so on the page).
#
# The project cost is the "money needed to start" the reader typed. Schemes do
# not count land in it; the page says so.


# PMEGP: KVIC "New PMEGP Guidelines", circular PMEGP/Policy/2022-23 of 1 June
# 2022, para 3.2 (the table of rates) and para 3.1 (the ceilings).
#   - A general-category applicant puts in 10% of the project cost and gets a
#     subsidy of 25% (rural) or 15% (urban).
#   - A special-category applicant (women, SC/ST/OBC, minorities, ex-servicemen
#     and others the guidelines name) puts in 5% and gets 35% (rural) or 25%
#     (urban).
#   - The cost counted is at most Rs.20 lakh for service and trading units and
#     Rs.50 lakh for manufacturing. The lower ceiling is used for everyone: the
#     category the reader picked does not say which of the two their unit is,
#     and it is the one that cannot promise too much. Above it the bank finances
#     the rest without subsidy.
#   - The bank finances everything the applicant does not put in (para 8.1); the
#     subsidy is kept in a deposit for three years and then set against the
#     loan, and no interest is charged on a loan up to that amount (para 11.20).
# Whether the reader is a special category is a question about the person, which
# this app does not ask, so both are priced and the reader reads their own.
#
# The guidelines approve the scheme for 2021-22 to 2025-26. Nothing found extends
# it past 31 March 2026, and the card says so rather than assert it is open.
PMEGP_COST_LIMIT = 2_000_000
PMEGP_CASES = (
    # code, own percent, subsidy percent when rural, when urban
    ("general", 10, 25, 15),
    ("special", 5, 35, 25),
)

# PMFME: Ministry of Food Processing Industries, the individual micro enterprise
# page (last updated 10 February 2021). A credit-linked capital subsidy of 35%
# of the eligible project cost, at most Rs.10 lakh a unit; the beneficiary puts in
# at least 10% and the rest is a bank loan. The page is about upgrading units
# that already exist. It states no period.
PMFME_OWN_PERCENT = 10
PMFME_SUBSIDY_PERCENT = 35
PMFME_SUBSIDY_LIMIT = 1_000_000

# Mudra: Department of Financial Services, the PMMY page (updated 5 February
# 2026). A band is named by the size of the loan, up to and including the limit.
# Tarun Plus is for those who repaid a Tarun loan; the page says so and the card
# repeats it. The page names no margin and no fee.
MUDRA_BANDS = (
    ("shishu", 50_000),
    ("kishore", 500_000),
    ("tarun", 1_000_000),
    ("tarun_plus", 2_000_000),
)


def _case(
    code: str,
    project_cost: float,
    money_in_hand: float,
    own_percent: float,
    subsidy_percent: float,
    subsidy_base: float,
    subsidy_limit: float | None = None,
):
    # Own money is a share of the whole cost, which is the reading that cannot
    # understate it when the cost is over a ceiling. The bank lends the rest, and
    # the subsidy is set against that loan, so what is left to repay is the loan
    # less the subsidy.
    own = round(project_cost * own_percent / 100, 2)
    subsidy = subsidy_base * subsidy_percent / 100
    if subsidy_limit is not None:
        subsidy = min(subsidy, subsidy_limit)
    subsidy = round(subsidy, 2)
    bank = round(project_cost - own, 2)
    return {
        "code": code,
        "own_percent": own_percent,
        "own_amount": own,
        "own_short_by": round(max(own - money_in_hand, 0), 2),
        "subsidy_percent": subsidy_percent,
        "subsidy_amount": subsidy,
        "bank_amount": bank,
        "net_loan_amount": round(bank - subsidy, 2),
    }


def _pmegp(project_cost: float, money_in_hand: float, funding_gap: float, location_type: str):
    # The guidelines know rural and urban. A semi-urban place is not rural, and a
    # missing or odd value is not known to be: both get the urban rates and say so.
    rural = location_type == "rural"
    area_assumed = location_type not in ("rural", "urban")
    counted_cost = min(project_cost, PMEGP_COST_LIMIT)
    return {
        "scheme_id": "pmegp",
        "kind": "subsidy",
        "terms": "kvic_2022",
        "area": "rural" if rural else "urban",
        "area_assumed": area_assumed,
        "limit_kind": "cost",
        "limit": PMEGP_COST_LIMIT,
        "limit_applied": project_cost > PMEGP_COST_LIMIT,
        "cases": [
            _case(
                code,
                project_cost,
                money_in_hand,
                own_percent,
                rural_percent if rural else urban_percent,
                counted_cost,
            )
            for code, own_percent, rural_percent, urban_percent in PMEGP_CASES
        ],
    }


def _pmfme(project_cost: float, money_in_hand: float, funding_gap: float, location_type: str):
    return {
        "scheme_id": "pmfme",
        "kind": "subsidy",
        "terms": "mofpi_2021",
        "limit_kind": "subsidy",
        "limit": PMFME_SUBSIDY_LIMIT,
        "limit_applied": project_cost * PMFME_SUBSIDY_PERCENT / 100 > PMFME_SUBSIDY_LIMIT,
        "cases": [
            _case(
                "all",
                project_cost,
                money_in_hand,
                PMFME_OWN_PERCENT,
                PMFME_SUBSIDY_PERCENT,
                project_cost,
                PMFME_SUBSIDY_LIMIT,
            )
        ],
    }


def _mudra(project_cost: float, money_in_hand: float, funding_gap: float, location_type: str):
    # A Mudra loan has no subsidy and no stated own share, so the figure that
    # picks the band is the loan the reader needs: the funding gap.
    band, band_limit = "none", None
    if funding_gap > 0:
        band, band_limit = "above_limit", MUDRA_BANDS[-1][1]
        for code, upto in MUDRA_BANDS:
            if funding_gap <= upto:
                band, band_limit = code, upto
                break
    return {
        "scheme_id": "pmmy",
        "kind": "loan_band",
        "terms": "dfs_2026",
        "loan_amount": funding_gap,
        "band": band,
        "band_limit": band_limit,
    }


BUILDERS = {"pmegp": _pmegp, "pmfme": _pmfme, "pmmy": _mudra}


def build_scheme_funding(
    project_cost: float,
    money_in_hand: float,
    location_type: str,
    matched_scheme_ids: list,
):
    """
    For each of PMEGP, PMFME and Mudra that the matcher found for this reader, in
    the order it found them: what the scheme asks the reader to put in, what it
    pays, and what is left to borrow. A scheme the matcher did not find is not
    priced, and a scheme this module has no table for is ignored.

    `status` is `no_project_cost` when there is nothing to finance, `no_scheme`
    when none of the three was matched, else `ok`.
    """
    funding_gap = round(max(project_cost - money_in_hand, 0), 2)
    schemes = []

    if project_cost > 0:
        for scheme_id in matched_scheme_ids:
            build = BUILDERS.get(scheme_id)
            if build:
                schemes.append(build(project_cost, money_in_hand, funding_gap, location_type))

    if project_cost <= 0:
        status = "no_project_cost"
    else:
        status = "ok" if schemes else "no_scheme"

    return {
        "status": status,
        "project_cost": project_cost,
        "money_in_hand": money_in_hand,
        "funding_gap": funding_gap,
        "schemes": schemes,
    }
