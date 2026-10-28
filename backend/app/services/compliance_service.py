# The registrations a business like the reader's usually has to ask about, taken
# from the published rules. There is no model and no judgement here: three small
# tables of limits, each saying where it was read, and whole-word lookups on the
# kind of business.
#
# Nothing here says a registration is required or that it is not. Every step is
# "usually needed", "not needed on this count", "depends" or "ask the office";
# the page says so, names each source with its date and tells the reader to
# confirm with the office. The limits change, and the dates below are when each
# was read. No eligibility rule and no fee is evaluated.
#
# The sales the limits are tested against are the reader's own expected monthly
# sales times 12, which the caller works out.

import re

# FSSAI: the Food Safety and Standards (Licensing and Registration of Food
# Businesses) Regulations, 2011, as compiled in the FSSAI compendium of 9 November
# 2017. Reg. 1.2.1(4) calls a food business "petty" when its annual turnover does
# not exceed Rs 12 lakh "and/or" it makes no more than 100 kg or litres a day (or
# handles no more than 500 litres of milk a day). Reg. 2.1.1(1): a petty business
# registers; reg. 2.1.2(1): any other holds a licence. The "and/or" is not
# settled by the text, so the page says "usually" and prints the daily limits.
# The proviso to reg. 2.1.1 exempts a milk producer who is a registered member of
# a dairy cooperative society and sells all the milk to it. Fees are not given.
FSSAI_SALES_LIMIT = 1_200_000
FSSAI_FOOD_PER_DAY = 100
FSSAI_MILK_PER_DAY = 500

# A typed business that holds one of these words handles food. Whole words only:
# "steam" holds "tea". Handicrafts and tailoring are the only kinds the page
# calls not food, and a food word wins over them.
FOOD_WORDS = frozenset(
    {
        "food", "foods", "dairy", "milk", "bakery", "sweet", "sweets", "snack", "snacks",
        "pickle", "pickles", "tiffin", "restaurant", "dhaba", "tea", "juice", "catering",
        "canteen",
    }
)  # fmt: skip

# GST: the CBIC booklet "GST: An Update", 1 June 2019. Registration is mandatory
# "only if the turnover exceeds" the limit, so exactly the limit is within it.
#   - Goods: Rs.40 lakh, and Rs.20 lakh in the ten States listed below.
#   - Services: Rs.20 lakh, and Rs.10 lakh in the four States listed below.
# The booklet gives no rule for a business that sells both, so such a business is
# "between" the two limits and told to ask. It says nothing of an agriculturist's
# own produce either; the page says it "can be treated differently" and asks.
GST_GOODS = 4_000_000
GST_GOODS_LOWER = 2_000_000
GST_SERVICES = 2_000_000
GST_SERVICES_LOWER = 1_000_000
GOODS_LOWER_STATES = frozenset(
    name.lower()
    for name in (
        "Arunachal Pradesh", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
        "Puducherry", "Sikkim", "Telangana", "Tripura", "Uttarakhand",
    )
)  # fmt: skip
SERVICES_LOWER_STATES = frozenset(name.lower() for name in ("Manipur", "Mizoram", "Nagaland", "Tripura"))

# Substrings of the category the reader chose (the ten buttons, or what they typed
# under "other"). No match either way, or a match both ways, is "mixed".
GOODS_WORDS = ("retail", "food", "handicraft", "agricultur", "dairy", "poultry", "manufactur")
FARM_WORDS = ("agricultur", "dairy", "poultry")

# Udyam: the Udyam Registration portal, read on 28 October 2026. Free, and it asks
# for the Aadhaar number, the PAN and the GST number where GST applies. Whether
# farming alone can register is not stated there, so nothing is said about it.
# This is the code of the scheme line "Udyam registration is required." in
# gen_schemes.py; the steps count the schemes shown to the reader that carry it.
UDYAM_REQUIRED = "elig.common.udyamNeeded"


def _udyam(scheme_matches: list):
    return {
        "id": "udyam",
        "need": "free",
        "source": "udyam_2026",
        "schemes_requiring": sum(UDYAM_REQUIRED in match["eligibility_codes"] for match in scheme_matches),
    }


def _local(location_type: str):
    # The dataset's own entry for the Gram Panchayat says it issues a
    # no-objection letter and trade permission. For a town nothing more is
    # claimed than that the municipal or town office is the place to ask.
    return {
        "id": "local",
        "need": "ask",
        "source": None,
        "place": "panchayat" if location_type == "rural" else "urban_body",
    }


def _fssai(phrase: str, yearly_sales: float):
    words = set(re.findall(r"[a-z]+", phrase))
    if words & FOOD_WORDS:
        need = "usually"
    elif "handicraft" in phrase or "tailoring" in phrase:
        need = "not_needed"
    else:
        need = "depends"
    kind = None
    if need != "not_needed":
        kind = "registration" if yearly_sales <= FSSAI_SALES_LIMIT else "licence"
    return {
        "id": "fssai",
        "need": need,
        "source": "fssai_2017",
        "kind": kind,
        "sales_limit": FSSAI_SALES_LIMIT,
        "food_per_day": FSSAI_FOOD_PER_DAY,
        "milk_per_day": FSSAI_MILK_PER_DAY,
        "dairy_exemption": bool(words & {"dairy", "milk"}),
    }


def _gst(phrase: str, state: str, yearly_sales: float):
    place = " ".join(state.lower().split())
    goods_limit = GST_GOODS_LOWER if place in GOODS_LOWER_STATES else GST_GOODS
    services_limit = GST_SERVICES_LOWER if place in SERVICES_LOWER_STATES else GST_SERVICES

    goods = any(word in phrase for word in GOODS_WORDS)
    services = "service" in phrase
    if "tailoring" in phrase or goods == services:
        supply = "mixed"
    else:
        supply = "goods" if goods else "services"
    farm = supply == "goods" and any(word in phrase for word in FARM_WORDS)

    if supply == "goods":
        low = high = goods_limit
    elif supply == "services":
        low = high = services_limit
    else:
        low, high = services_limit, goods_limit

    if yearly_sales <= low:
        case, limit = "within", low
    elif yearly_sales > high:
        case, limit = ("farm_above" if farm else "above"), high
    else:
        case, limit = "between", None
    return {
        "id": "gst",
        "need": {"within": "not_needed", "above": "usually"}.get(case, "depends"),
        "source": "cbic_2019",
        "state": state.strip(),
        "supply": supply,
        "goods_limit": goods_limit,
        "services_limit": services_limit,
        "limit": limit,
        "farm": farm,
        "case": case,
    }


def build_compliance(
    business_category: str,
    state: str,
    location_type: str,
    yearly_sales: float,
    scheme_matches: list,
):
    """
    The checklist for one request: Udyam, the local office, FSSAI and GST, in that
    order. `yearly_sales` is the reader's expected monthly sales times 12.
    `scheme_matches` is read, not changed.
    """
    phrase = " ".join(business_category.lower().split())
    return {
        "yearly_sales": yearly_sales,
        "steps": [
            _udyam(scheme_matches),
            _local(location_type),
            _fssai(phrase, yearly_sales),
            _gst(phrase, state, yearly_sales),
        ],
    }
