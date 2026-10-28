"""What the model is asked, and what of its answer is believed (services/intake_service.py).

The model turns a person's words into candidate form answers. Nothing it says
is trusted: each answer must name a field we asked about, carry a value of the
right kind and range, and quote words the person actually said. An answer that
fails any of those is dropped, never repaired, and the person still reviews
whatever survives before it reaches a form.
"""

import re

import pytest

from app.schemas.limits import MAX_PLACE_LENGTH, MAX_RUPEES
from app.services import intake_service as intake


TRANSCRIPT = (
    "I stitch clothes in Lucknow, in Uttar Pradesh, in a village. "
    "I have 50,000 rupees saved and I need 1 lakh to buy two machines. "
    "My family earns 20000 a month. I pay no EMI."
)


def text(field, value, evidence):
    return {"field": field, "value": value, "evidence": evidence}


def money(field, rupees, evidence):
    return {"field": field, "rupees": rupees, "evidence": evidence}


def raw(texts=(), moneys=()):
    return {"text_answers": list(texts), "money_answers": list(moneys)}


def check(model_answer, transcript=TRANSCRIPT):
    return intake.validate_extraction(model_answer, transcript)


def only(result):
    (answer,) = result["answers"]
    return answer


# ---------------------------------------------------------------- what is kept


def test_a_grounded_text_answer_is_kept():
    result = check(raw(texts=[text("business_category", "tailoring", "I stitch clothes")]))

    assert result == {
        "answers": [{"field": "business_category", "value": "tailoring", "evidence": "I stitch clothes"}],
        "ignored": 0,
    }


def test_a_grounded_money_answer_is_kept_as_a_whole_number():
    result = check(raw(moneys=[money("available_capital", 50000, "50,000 rupees saved")]))

    assert result == {
        "answers": [{"field": "available_capital", "value": 50000, "evidence": "50,000 rupees saved"}],
        "ignored": 0,
    }
    assert type(only(result)["value"]) is int


def test_nothing_found_is_a_valid_empty_result():
    assert check(raw()) == {"answers": [], "ignored": 0}


def test_answers_come_back_in_the_order_the_form_asks_its_questions():
    result = check(
        raw(
            texts=[text("state", "Uttar Pradesh", "Uttar Pradesh"), text("business_category", "tailoring", "stitch clothes")],
            moneys=[money("monthly_emi", 0, "no EMI"), money("initial_investment", 100000, "1 lakh")],
        )
    )

    assert [answer["field"] for answer in result["answers"]] == [
        "business_category",
        "initial_investment",
        "state",
        "monthly_emi",
    ]


def test_every_form_field_is_either_a_text_or_a_money_field():
    assert set(intake.TEXT_FIELDS) | set(intake.MONEY_FIELDS) == set(intake.FORM_ORDER)
    assert not set(intake.TEXT_FIELDS) & set(intake.MONEY_FIELDS)
    assert len(intake.FORM_ORDER) == 12


# ---------------------------------------------------------------- the quote has to be the person's words


def test_an_answer_whose_quote_is_not_in_what_was_said_is_dropped():
    result = check(raw(moneys=[money("available_capital", 50000, "I have fifty thousand in the bank")]))

    assert result == {"answers": [], "ignored": 1}


@pytest.mark.parametrize(
    "quote",
    ["i STITCH   clothes", "I stitch\nclothes", "  I stitch clothes  ", "ＩＩ stitch"[1:]],
    ids=["case", "line break", "outer space", "full-width letter"],
)
def test_the_quote_may_differ_in_case_spacing_and_character_width(quote):
    result = check(raw(texts=[text("business_category", "tailoring", quote)]))

    # The answer shows the quote without the spaces around it.
    assert only(result)["evidence"] == quote.strip()


@pytest.mark.parametrize("quote", ["", " ", "a", ".", "...", "?!", "।"], ids=repr)
def test_a_quote_with_nothing_in_it_grounds_nothing(quote):
    # Every one of these is in the transcript: a lone letter, and marks that a
    # speech model writes for a pause or a question.
    transcript = TRANSCRIPT + " ... ?! । "

    result = check(raw(texts=[text("business_category", "tailoring", quote)]), transcript)

    assert result == {"answers": [], "ignored": 1}


@pytest.mark.parametrize("quote", [None, 5, ["I stitch clothes"], {"a": 1}], ids=repr)
def test_a_quote_that_is_not_text_grounds_nothing(quote):
    result = check(raw(texts=[text("business_category", "tailoring", quote)]))

    assert result == {"answers": [], "ignored": 1}


def test_invisible_joiner_characters_do_not_stop_a_quote_from_matching():
    # Indic text carries zero-width joiners that a speech model, or a person
    # retyping the words, may add or drop. They are not part of any word.
    transcript = "मैं क्\u200dषत्रिय हूँ और सिलाई करती हूँ।"

    result = check(raw(texts=[text("business_category", "tailoring", "क्षत्रिय हूँ और सिलाई")]), transcript)

    assert only(result)["field"] == "business_category"


def test_a_quote_may_not_be_assembled_from_two_places():
    result = check(raw(texts=[text("business_category", "tailoring", "I stitch clothes, two machines")]))

    assert result["answers"] == []


def test_the_quote_is_matched_in_other_scripts_too():
    transcript = "मैं लखनऊ में सिलाई करती हूँ। मेरे पास ५०,००० रुपये हैं।"

    result = check(
        raw(
            texts=[text("district", "Lucknow", "लखनऊ में")],
            moneys=[money("available_capital", 50000, "५०,००० रुपये")],
        ),
        transcript,
    )

    assert [answer["field"] for answer in result["answers"]] == ["district", "available_capital"]


# ---------------------------------------------------------------- fields and kinds


@pytest.mark.parametrize("field", ["employees", "password", "", "State", "business category", None, 7])
def test_a_field_we_did_not_ask_for_is_dropped(field):
    result = check(raw(texts=[text(field, "x", "I stitch clothes")]))

    assert result == {"answers": [], "ignored": 1}


def test_a_money_field_in_the_text_list_and_a_text_field_in_the_money_list_are_dropped():
    result = check(
        raw(
            texts=[text("available_capital", "50000", "50,000 rupees")],
            moneys=[money("state", 5, "Uttar Pradesh")],
        )
    )

    assert result == {"answers": [], "ignored": 2}


# ---------------------------------------------------------------- text values


@pytest.mark.parametrize(
    ("value", "kept"),
    [
        ("tailoring", "tailoring"),
        (" Tailoring ", "tailoring"),
        ("FOOD PROCESSING", "food processing"),
        ("dairy", "dairy"),
        ("Poultry", "poultry"),
    ],
)
def test_a_category_is_one_of_the_fixed_choices_whatever_its_case(value, kept):
    result = check(raw(texts=[text("business_category", value, "stitch clothes")]))

    assert only(result)["value"] == kept


@pytest.mark.parametrize("value", ["stitching", "other", "", "tailoring and dairy", None, 5])
def test_a_category_outside_the_fixed_choices_is_dropped(value):
    result = check(raw(texts=[text("business_category", value, "stitch clothes")]))

    assert result == {"answers": [], "ignored": 1}


def test_the_categories_are_the_ones_the_business_page_offers():
    assert intake.CATEGORIES == (
        "retail",
        "food processing",
        "handicrafts",
        "tailoring",
        "agriculture",
        "dairy",
        "poultry",
        "services",
        "manufacturing",
    )


@pytest.mark.parametrize("value", ["rural", "Semi-Urban", "URBAN"])
def test_an_area_type_is_one_of_the_three_choices(value):
    result = check(raw(texts=[text("location_type", value, "in a village")]))

    assert only(result)["value"] == value.lower()


@pytest.mark.parametrize("value", ["village", "semi urban", "suburban", ""])
def test_any_other_area_type_is_dropped(value):
    assert check(raw(texts=[text("location_type", value, "in a village")]))["answers"] == []


def test_a_state_and_a_district_are_kept_as_given_for_the_form_to_match():
    result = check(
        raw(texts=[text("state", " Uttar Pradesh ", "Uttar Pradesh"), text("district", "Lucknow", "Lucknow")])
    )

    assert [answer["value"] for answer in result["answers"]] == ["Uttar Pradesh", "Lucknow"]


@pytest.mark.parametrize("field", ["state", "district"])
@pytest.mark.parametrize("value", ["", "   ", "x" * (MAX_PLACE_LENGTH + 1), None, 3])
def test_a_place_that_is_blank_too_long_or_not_text_is_dropped(field, value):
    assert check(raw(texts=[text(field, value, "Lucknow")]))["answers"] == []


# ---------------------------------------------------------------- money values


@pytest.mark.parametrize("rupees", [0, 1, 50000, MAX_RUPEES])
def test_a_whole_number_of_rupees_up_to_the_cap_is_kept(rupees):
    result = check(raw(moneys=[money("existing_debt", rupees, "no EMI")]))

    assert only(result)["value"] == rupees


@pytest.mark.parametrize(
    "rupees",
    [-1, MAX_RUPEES + 1, 1.5, 50000.0, "50000", None, True, False, [50000], float("inf"), float("nan")],
    ids=repr,
)
def test_an_amount_that_is_not_a_whole_number_in_range_is_dropped(rupees):
    result = check(raw(moneys=[money("existing_debt", rupees, "no EMI")]))

    assert result == {"answers": [], "ignored": 1}


def test_a_household_income_of_zero_is_dropped_because_it_needs_its_own_confirmation():
    zero = check(raw(moneys=[money("household_monthly_income", 0, "My family earns 20000")]))
    some = check(raw(moneys=[money("household_monthly_income", 20000, "My family earns 20000")]))

    assert zero == {"answers": [], "ignored": 1}
    assert only(some)["value"] == 20000


@pytest.mark.parametrize(
    ("rupees", "quote", "kept"),
    [
        (50000, "50,000", True),
        (50000, "₹50,000", True),
        (50000, "Rs. 50000", True),
        (50000, "rs 50 000", True),
        (150000, "1,50,000", True),
        (50000, "५०,०००", True),
        (5000, "50,000", False),
        (500000, "50,000", False),
        (50000, "5,000", False),
        (1, "50,000", False),
        (5000, "₹50,000", False),
        (500000, "Rs. 50000", False),
        (5000, "५०,०००", False),
        (5000, "50,000 rupees", False),
    ],
)
def test_when_the_quote_is_just_the_digits_the_amount_must_equal_them(rupees, quote, kept):
    transcript = f"I have {quote} saved."

    result = check(raw(moneys=[money("available_capital", rupees, quote)]), transcript)

    assert bool(result["answers"]) is kept
    assert result["ignored"] == (0 if kept else 1)


@pytest.mark.parametrize(
    ("rupees", "quote"),
    [(50000, "50 hazaar"), (100000, "1 lakh"), (150000, "1.5 lakh"), (50000, "पचास हज़ार")],
)
def test_a_spoken_amount_is_not_checked_by_code_and_is_left_to_the_person(rupees, quote):
    # The code cannot know every scale word in eight languages. The review
    # screen shows this quote beside the amount; that is the check.
    transcript = f"I have {quote} saved."

    result = check(raw(moneys=[money("available_capital", rupees, quote)]), transcript)

    assert only(result)["value"] == rupees


# ---------------------------------------------------------------- duplicates, shape, volume


def test_the_first_answer_for_a_field_wins_and_the_rest_count_as_ignored():
    result = check(
        raw(
            moneys=[
                money("available_capital", 50000, "50,000 rupees"),
                money("available_capital", 1000, "1 lakh"),
            ]
        )
    )

    assert only(result)["value"] == 50000
    assert result["ignored"] == 1


def test_a_bad_item_does_not_stop_the_good_ones():
    result = check(
        raw(
            texts=["not an object", None, text("business_category", "tailoring", "stitch clothes")],
            moneys=[{"field": "available_capital"}, money("monthly_emi", 0, "no EMI")],
        )
    )

    assert [answer["field"] for answer in result["answers"]] == ["business_category", "monthly_emi"]
    assert result["ignored"] == 3


@pytest.mark.parametrize(
    "model_answer",
    [
        None,
        "text",
        [],
        {},
        {"text_answers": []},
        {"money_answers": []},
        {"text_answers": "x", "money_answers": []},
        {"text_answers": [], "money_answers": {"a": 1}},
    ],
    ids=repr,
)
def test_an_answer_that_is_not_in_the_shape_we_asked_for_is_an_error(model_answer):
    with pytest.raises(intake.BadModelOutput):
        check(model_answer)


def test_extra_keys_in_the_answer_are_ignored():
    result = check({**raw(), "thoughts": "I think the person is a tailor"})

    assert result == {"answers": [], "ignored": 0}


# ---------------------------------------------------------------- the schema the model must follow


def _objects(node):
    if isinstance(node, dict):
        if node.get("type") == "object":
            yield node
        for value in node.values():
            yield from _objects(value)
    elif isinstance(node, list):
        for value in node:
            yield from _objects(value)


def _depth(node):
    if isinstance(node, dict):
        return 1 + max((_depth(value) for value in node.values()), default=0)
    if isinstance(node, list):
        return max((_depth(value) for value in node), default=0)
    return 0


def test_the_schema_asks_for_two_lists_with_exactly_our_field_names():
    schema = intake.extraction_schema()

    assert schema["type"] == "object"
    assert set(schema["required"]) == {"text_answers", "money_answers"}

    text_item = schema["properties"]["text_answers"]["items"]
    money_item = schema["properties"]["money_answers"]["items"]

    assert text_item["properties"]["field"]["enum"] == list(intake.TEXT_FIELDS)
    assert money_item["properties"]["field"]["enum"] == list(intake.MONEY_FIELDS)
    assert money_item["properties"]["rupees"]["type"] == "integer"
    assert set(text_item["required"]) == {"field", "value", "evidence"}
    assert set(money_item["required"]) == {"field", "rupees", "evidence"}


def test_the_schema_stays_inside_what_the_model_api_accepts():
    # Meta's documented limits for structured output: nesting depth 10, 1,000
    # enum values in all, no recursive schema. Closed objects keep the model
    # from inventing keys.
    schema = intake.extraction_schema()
    text = str(schema)

    assert _depth(schema) <= 10
    assert text.count("'enum'") >= 2
    assert "$ref" not in text and "$defs" not in text
    assert all(obj.get("additionalProperties") is False for obj in _objects(schema))


def test_the_schema_has_a_name_the_model_api_accepts():
    # response_format.json_schema.name: letters, digits, underscores and dashes, 64 at most.
    assert re.fullmatch(r"[A-Za-z0-9_-]{1,64}", intake.SCHEMA_NAME)


# ---------------------------------------------------------------- what the model is told


MARKER = "S3NT-transcript-marker"


def test_the_persons_words_reach_the_model_only_as_the_user_message():
    messages = intake.extraction_messages(MARKER, "hi")

    assert [message["role"] for message in messages] == ["developer", "user"]
    assert MARKER in messages[1]["content"]
    # The higher-priority message is ours alone: words a person says must never
    # be able to sit in it and read as an instruction.
    assert MARKER not in messages[0]["content"]


def test_the_instructions_name_the_language_the_rules_and_every_field():
    instructions = intake.extraction_messages("x", "ta")[0]["content"]

    assert "Tamil" in instructions
    for field in intake.FORM_ORDER:
        assert field in instructions
    for category in intake.CATEGORIES:
        assert category in instructions
    # The rules that keep the model from guessing.
    for rule in ("exact words", "never guess", "instructions", "household_monthly_income"):
        assert rule in instructions.lower()


@pytest.mark.parametrize("code", ["en", "hi", "ta", "te", "ml", "kn", "mr", "bn"])
def test_every_interface_language_can_be_extracted(code):
    assert intake.extraction_messages("x", code)


def test_an_unknown_language_is_refused():
    with pytest.raises(KeyError):
        intake.extraction_messages("x", "fr")


def test_speech_recognition_is_offered_in_seven_of_the_eight_languages():
    # Meta's speech model does not list Malayalam.
    assert set(intake.ASR_LANGUAGES) == {"en", "hi", "ta", "te", "kn", "mr", "bn"}
    assert intake.ASR_LANGUAGES["hi"] == "Hindi"
    assert "ml" not in intake.ASR_LANGUAGES
    assert set(intake.LANGUAGES) == set(intake.ASR_LANGUAGES) | {"ml"}


def test_the_speech_keywords_are_a_short_list_of_plain_words():
    # Meta states no limit on the list, so it stays short.
    words = intake.SPEECH_KEYWORDS

    assert isinstance(words, tuple)
    assert 0 < len(words) <= 20
    assert len(set(words)) == len(words)
    assert all(isinstance(word, str) and word == word.strip() and 2 <= len(word) <= 40 for word in words)


def test_the_speech_keywords_hold_the_money_words_and_every_kind_of_business():
    # The words a speech model is likeliest to mishear in this app's answers:
    # the Indian counting words, the loan word, the choices on the form.
    assert {"lakh", "crore", "EMI"} <= set(intake.SPEECH_KEYWORDS)
    assert set(intake.CATEGORIES) <= set(intake.SPEECH_KEYWORDS)
