"""The AI plan's rules: what the model is told, and how little of its reply is believed.

The analysis (analysis_service.py) works out every figure and writes its own
advice. This module lets a language model put that into friendlier words, once
the person has asked for it, and keeps it from putting anything else in. It makes
no network call and does no arithmetic with the person's money.

The model is given no figure, no name and no place. It is told, in words, how the
rules judged the business, and which placeholders ({{profit}}, {{loan}} and so on)
stand for the figures. It writes the plan with the placeholders in it, and the
rules' own figures are put in afterwards. A reply is kept only if
  - it is the three parts asked for, in the right numbers;
  - every character is a letter of the language's own script, ordinary
    punctuation or a placeholder: no digit in any script, no sign, no markup;
  - it spells out no amount, count or percentage in words (a list per language);
  - every placeholder it uses was offered, and every required one is there.
Anything else is refused whole and never repaired, apart from spacing. The reasons
(short codes, never its words) are what the retry is told.

What no code here can check: that the plan is wise or promises nothing, that a
number is not spelled out in a word the lists lack, that a name is not written in
the language's own script, or that a Marathi plan is Marathi and not Hindi (both
are Devanagari). docs/PROCESSOR_SCHEDULE.md says so.
"""

import re
import unicodedata
from itertools import groupby

from app.services.intake_service import CATEGORIES, LANGUAGES

# The name of the reply's JSON schema in the chat call.
SCHEMA_NAME = "business_plan"

# One try and one retry with the reasons. Each try is charged to the spend ledger.
MAX_ATTEMPTS = 2

# Reasoning tokens share this cap with the written plan, and a plan in an Indian
# script takes several tokens a word. Worst case, a try books about $0.04.
MAX_COMPLETION_TOKENS = 8000

# How long the client waits for a reply. Nothing comes back until the model has
# reasoned and written the whole plan, so this is more than its default of 30.
CALL_TIMEOUT_SECONDS = 150

MIN_STEPS, MAX_STEPS = 3, 5
MIN_CAUTIONS, MAX_CAUTIONS = 1, 3

# Characters in one part (the summary, one step, one caution).
MAX_PART_LENGTH = 400

# A plan with fewer figures than this is not about this business.
MIN_FIGURES = 2

NO_PLAN = "A plan could not be written. The advice above still applies."


class BadPlan(ValueError):
    """The reply was refused. `reasons` are codes such as "digit" or "missing:gap", never the reply's words."""

    def __init__(self, reasons):
        super().__init__(",".join(reasons))
        self.reasons = reasons


# --- the figures, written the way the rest of the app writes them -------------


def grouped(value: float):
    # Indian grouping (1,00,000), up to two decimals and none that are zero. For
    # a value that is not negative.
    whole, _, fraction = f"{value:.2f}".partition(".")
    head, text = whole[:-3], whole[-3:]
    while len(head) > 2:
        head, text = head[:-2], head[-2:] + "," + text
    text = head + "," + text if head else text
    fraction = fraction.rstrip("0")
    return text + "." + fraction if fraction else text


def money(value: float):
    return ("-" if value < 0 else "") + "₹" + grouped(abs(value))


def percent(value: float):
    return grouped(value) + "%"


# --- what the model may be told about a scheme -------------------------------

# A scheme is described by who runs it and the kinds of help it gives, never by
# its name, its amounts or its place. The model writes the placeholder and the
# system puts the name in.
LEVEL_PHRASE = {
    "central": "run by the central government for all of India",
    "state": "run by a state government",
    "regional": "run for a group of states",
    "district": "run through the district office",
    "sub_district": "run through the tehsil or sub-division office",
    "block": "run through the block office",
    "local_body": "run locally, through the village council, the town body or a service centre",
}

HELP = {
    "loan": "a loan",
    "subsidy": "a subsidy towards the cost",
    "training": "training",
    "tools": "tools or equipment",
    "papers": "help with papers and forms",
    "funds": "funds for a group",
    "complaint": "a place to complain about a refused or delayed loan",
    "permission": "a trade permission",
    "livelihood": "support to build local earning work",
    "loanhelp": "help getting a loan",
}

# One entry per scheme in data/schemes.json; a test fails when a scheme has none.
HELP_BY_SCHEME = {
    "pmfme": ("loan", "subsidy"),
    "pmegp": ("loan", "subsidy"),
    "pmmy": ("loan",),
    "pmvishwakarma": ("tools", "training", "loan"),
    "standupindia": ("loan",),
    "nlm": ("subsidy",),
    "ahidf": ("loan", "subsidy"),
    "aif": ("loan", "subsidy"),
    "kcc": ("loan",),
    "up_myuva": ("loan",),
    "up_vssy": ("training", "tools"),
    "mh_cmegp": ("loan", "subsidy"),
    "tn_needs": ("training", "loan", "subsidy"),
    "kl_ess": ("subsidy",),
    "wb_bcc": ("loan", "subsidy"),
    "ka_udyogini": ("loan", "subsidy"),
    "unnati_ner": ("subsidy",),
    "vvp_border": ("livelihood",),
    "dic": ("papers",),
    "rseti": ("training", "loanhelp"),
    "kvk": ("training",),
    "odop_up": ("tools", "training", "subsidy"),
    "tehsil_certificates": ("papers",),
    "subdiv_agri": ("subsidy", "tools"),
    "bdo_nrlm": ("funds", "training"),
    "blbc": ("complaint",),
    "atma_block": ("training",),
    "gp_licence": ("permission",),
    "csc": ("papers",),
    "svanidhi": ("loan",),
}

# What each placeholder stands for, as the model is told it. A placeholder is
# offered only when the situation has its figure.
MEANING = {
    "state": "the state the business is in",
    "district": "the district the business is in",
    "revenue": "what the owner expects the business to bring in each month",
    "expenses": "what the owner expects the business to spend each month",
    "capital": "the money the owner already has for the business",
    "investment": "the money the business needs to start",
    "profit": "what the business should earn each month after its costs",
    "loss": "how much the business should lose each month",
    "gap": "the money still missing to start the business",
    "loan": "the size of the loan the rules suggest",
    "tenure": "how many months that loan would take to repay (a bare count, so write the word for months yourself)",
    "repayment": "what that loan would cost to repay each month",
    "left": "the part of the missing money that even this loan does not cover",
    "rate": "the yearly interest the rules assumed, which is not a lender's quote",
    "pressure": "the share of the money left each month after costs that all the loan repayments would take",
    "household_percent": "the share of the household's monthly income that all the loan repayments would take",
    "current_repayment": "what the household already repays each month on loans",
    "market_count": "how many businesses of this kind are registered in the district (a bare count, so say what it counts yourself; it does not show how many customers there are)",
}

# The rules' verdicts, as sentences. Each is chosen by an enum the analysis
# returns, so the model never reads a figure, only how the figures came out.
WHERE = {
    "rural": "It is in a village.",
    "semi-urban": "It is in a small town.",
    "urban": "It is in a city.",
}

VERDICTS = (
    (
        "financial_status",
        {
            "profitable": "The business is expected to make a profit each month after its costs.",
            "break_even": "The business is expected to just cover its costs each month, with nothing left over.",
            "loss": "The business is expected to lose money each month.",
        },
    ),
    (
        "feasibility_status",
        {
            "feasible": "Its day-to-day running costs are comfortably covered by what it brings in.",
            "break_even": "Its day-to-day running costs are only just covered by what it brings in.",
            "not_feasible": "Its day-to-day running costs are not covered by what it brings in.",
        },
    ),
    (
        "has_gap",
        {
            True: "The owner does not have enough money to start and has to find the rest.",
            False: "The owner already has enough money to start.",
        },
    ),
    (
        "risk_level",
        {
            "low": "Loan repayments, counting a loan for any missing money, would take a small part of the monthly surplus.",
            "moderate": "Loan repayments, counting a loan for any missing money, would take a large part of the monthly surplus.",
            "high": "Loan repayments, counting a loan for any missing money, would take too much of the monthly surplus.",
        },
    ),
    (
        "household_check",
        {
            "within_limit": "Loan repayments would stay within a safe share of the household's income.",
            "over_limit": "Loan repayments would be more than the household's income can safely carry.",
        },
    ),
    (
        "financing_status",
        {
            "covered": "A loan can cover all the missing money and still be repaid comfortably.",
            "partial": "A loan can cover only part of the missing money comfortably; the rest has to come from somewhere else.",
            "no_room": "No loan can be recommended, because the monthly surplus has no room for one.",
            "household_over_limit": "No loan can be recommended, because the household already repays as much as it safely can.",
            "no_surplus": "No loan can be recommended, because the business leaves no monthly surplus.",
        },
    ),
    ("repaying", {True: "The household already repays a loan each month."}),
)

# --- what the situation gives the model --------------------------------------


def _has_a_number(text: str):
    # Any character Unicode files under Number, in any script: not just 0-9.
    return any(unicodedata.category(character)[0] == "N" for character in text)


def _category(typed: str):
    # Only one of our own words reaches the model, never what the person typed.
    phrase = typed.lower()
    return next((word for word in CATEGORIES if word in phrase), "a small business")


def _focus(options: dict):
    # The loan the plan talks about: the one the rules recommend, else the
    # biggest (the shortest, among equals). None when no loan is offered.
    for option in options["options"]:
        if option["code"] == options["recommended_by_rules"]:
            return option
    return max(options["options"], key=lambda o: (o["loan_amount"], -o["tenure_months"]), default=None)


def _join(items):
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def _scheme_meaning(match: dict):
    kinds = _join([HELP[kind] for kind in HELP_BY_SCHEME[match["scheme_id"]]])
    return f"the name of a government scheme, {LEVEL_PHRASE[match['level']]}, that offers {kinds}"


def build_context(answers: dict, analysis: dict):
    """
    What the plan is built from: `values` (placeholder -> the text the rules' own
    figure goes in as), `required` (which of them the plan must carry),
    `meaning` (what each stands for), `category`, `facts` (the verdicts, in
    words) and `advice` (the rules' own sentences). `values` is also the list of
    placeholders the model may use.
    """
    finance, risk, options = analysis["financial_analysis"], analysis["risk_analysis"], analysis["financing_options"]
    values, required, meaning = {}, [], {}

    def put(name, text, must=False, means=None):
        values[name] = text
        meaning[name] = means or MEANING[name]
        if must:
            required.append(name)

    put("state", answers["state"].strip())
    if answers.get("district", "").strip():
        put("district", answers["district"].strip())
    put("revenue", money(finance["expected_monthly_revenue"]))
    put("expenses", money(finance["monthly_expenses"]))
    put("capital", money(finance["available_capital"]))
    put("investment", money(finance["initial_investment"]))

    profit = finance["monthly_profit"]
    if profit > 0:
        put("profit", money(profit), True)
    elif profit < 0:
        put("loss", money(-profit), True)

    gap = finance["funding_gap"]
    if gap > 0:
        put("gap", money(gap), True)

    focus = _focus(options)
    if focus:
        put("loan", money(focus["loan_amount"]), True)
        put("tenure", str(focus["tenure_months"]), True)
        put("repayment", money(focus["monthly_repayment"]), True)
        if focus["remaining_gap"] > 0:
            put("left", money(focus["remaining_gap"]), True)
        put("rate", percent(options["assumed_interest_rate_percent"]))

    # The percentages are the loan's own when there is one. The analysis prices
    # the whole gap over 60 months, and a 24-month repayment beside that ratio
    # would be two different loans in one sentence. With a gap but no loan to
    # recommend, there is no figure that belongs to the plan, so none is offered.
    emi = risk["monthly_emi"]
    source = focus or (risk if emi > 0 and gap == 0 else None)
    if source:
        if source["pressure_ratio_percent"] is not None:
            put("pressure", percent(source["pressure_ratio_percent"]))
        if source["household_repayment_percent"] is not None:
            put("household_percent", percent(source["household_repayment_percent"]))
    if emi > 0:
        put("current_repayment", money(emi))

    local = next(
        (
            row["count"]
            for row in analysis["market_context"]
            if row.get("scope") == "district"
            and row.get("metric") == "registered_units"
            and not row.get("count_suppressed")
            and row.get("count") is not None
        ),
        None,
    )
    if local is not None:
        put("market_count", grouped(local))

    for letter, match in zip("abc", analysis["scheme_matches"]):
        put(f"scheme_{letter}", match["name"], letter == "a", _scheme_meaning(match))

    borrowing = gap > 0 or emi > 0
    states = {
        "financial_status": finance["financial_status"],
        "feasibility_status": analysis["business_analysis"]["feasibility_status"],
        "has_gap": gap > 0,
        "risk_level": risk["risk_level"] if borrowing else None,
        "household_check": risk["household_check"] if borrowing else None,
        "financing_status": options["status"],
        "repaying": emi > 0,
    }
    category = _category(answers["business_category"])
    facts = [f"The kind of business: {category}."]
    if answers.get("location_type") in WHERE:
        facts.append(WHERE[answers["location_type"]])
    facts += [table[states[key]] for key, table in VERDICTS if states[key] in table]

    summary = analysis["mvp_summary"]
    advice = [summary["simple_message"], summary["next_step"], *analysis["advisory"]["recommendations"]]
    advice = [sentence for sentence in dict.fromkeys(advice) if sentence and not _has_a_number(sentence)]

    return {
        "values": values,
        "required": required,
        "meaning": meaning,
        "category": category,
        "facts": facts,
        "advice": advice,
    }


# --- what the model is sent --------------------------------------------------

FIXES = {
    "shape": "Reply with only the JSON object asked for, with exactly its three parts.",
    "count": "Write three to five steps and one to three cautions.",
    "empty": "Leave no step or caution empty.",
    "long": "Keep every sentence short.",
    "digit": "You wrote a digit or a number sign. Never write one; use a placeholder.",
    "bad_character": "You used a symbol, a currency sign, markup or a link. Use plain words and ordinary punctuation only.",
    "wrong_script": "Write only in the language asked for, in its own script, with no words from another language.",
    "link": "Do not write a web address or an email address.",
    "braces": "Write each placeholder exactly as listed, with two curly brackets on each side and only its name inside.",
    "placeholder": "You used a placeholder that was not listed. Use only the listed ones.",
    "acronym": "Do not use abbreviations or words in capital letters.",
    "capital": "Do not write names. In English, use a capital letter only at the start of a sentence.",
    "few_placeholders": "Use more of the placeholders, so the plan carries the real figures.",
}


def _tag(name: str):
    return "{{" + name + "}}"


def _fix(reason: str, context: dict):
    code, _, detail = reason.partition(":")
    if code == "number_word" and detail in ALL_NUMBER_WORDS:
        return f'Do not write the word "{detail}", or any amount, count, share or percentage in words.'
    if code == "number_word":
        return "Do not write any amount, count, share or percentage in words."
    if code == "missing" and detail in context["required"]:
        return f"The placeholder {_tag(detail)} is missing from the plan. It has to be in it."
    return FIXES.get(code)


def plan_messages(context: dict, language: str, rejected=()):
    """The two messages to send: our instructions, and the situation. `rejected` is the last reply's reasons."""
    name = LANGUAGES[language]
    legend = "\n".join(f"- {_tag(placeholder)}: {context['meaning'][placeholder]}" for placeholder in context["values"])
    musts = ", ".join(_tag(placeholder) for placeholder in context["required"])

    instructions = (
        "You write a short, practical plan for a small business owner in India, who may find reading hard. "
        "Fixed rules have already studied the business. The user message gives their verdicts and their own advice, in words. "
        "You are never given a figure, and you never write one.\n\n"
        f"Write the plan in {name}, in its own script, in short plain sentences. Speak to the owner as \"you\".\n\n"
        "How to write it:\n"
        "- Use no digit or number sign in any script. Write no amount, count, share or percentage in words either "
        "(so no lakh, thousand, percent, rupees or half).\n"
        "- Where a figure belongs, write a placeholder from the list below, exactly as listed, "
        "with two curly brackets on each side. The system puts the real figure in.\n"
        "- Write no names of people, places, banks or organisations. A scheme placeholder already stands for the scheme's name.\n"
        "- Use no abbreviations, links, symbols, currency signs, markdown or emoji. Use plain words and ordinary punctuation only. "
        "In English, use a capital letter only at the start of a sentence.\n"
        "- Never promise that a loan or a scheme will be given. Tell the owner to ask whether they qualify.\n"
        "- Stay consistent with the rules' own advice. Do not add advice about interest, tax or law.\n\n"
        f"Placeholders:\n{legend}\n\n"
        f"In the plan you must use each of these at least once: {musts}.\n\n"
        "Give the plan as a JSON object. \"summary\" is one or two sentences on where the business stands. "
        "\"steps\" is three to five short steps in a sensible order. \"cautions\" is one to three short cautions."
    )

    situation = "About the business:\n" + "\n".join(f"- {fact}" for fact in context["facts"])
    if context["advice"]:
        situation += "\n\nThe rules' own advice, in English. Your plan has to agree with it:\n"
        situation += "\n".join(f"- {sentence}" for sentence in context["advice"])
    fixes = list(dict.fromkeys(filter(None, (_fix(reason, context) for reason in rejected))))
    if fixes:
        situation += "\n\nYour last reply was rejected. Write the whole plan again and fix this:\n"
        situation += "\n".join(f"- {fix}" for fix in fixes)

    return [{"role": "developer", "content": instructions}, {"role": "user", "content": situation}]


def plan_schema():
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "steps": {"type": "array", "items": {"type": "string"}},
            "cautions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["summary", "steps", "cautions"],
        "additionalProperties": False,
    }


# --- how much of the reply is believed ---------------------------------------

SCRIPT = {
    "en": "LATIN",
    "hi": "DEVANAGARI",
    "mr": "DEVANAGARI",
    "bn": "BENGALI",
    "ta": "TAMIL",
    "te": "TELUGU",
    "kn": "KANNADA",
    "ml": "MALAYALAM",
}

# The punctuation a plan may use, with the Devanagari and Bengali full stop. Not
# "/", "@", "&", "%" or the brackets that could make a link or markup.
PUNCTUATION = set(".,;:!?'’‘\"“”-–—…()।")

# Zero-width joiner and non-joiner are part of how some scripts are written.
JOINERS = "\u200c\u200d"

PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z_]+)\s*\}\}")
NAMED = re.compile(r"\{\{([A-Za-z_]+)\}\}")
LINK = re.compile(r"\w\.\w|://|www", re.IGNORECASE)

# Capitals that may follow the start of an English sentence.
ALLOWED_CAPITALS = {"I", "India", "Indian", "Indians"}

# Amounts, counts, shares and currencies written as words, per language. "one"
# and the ordinals are allowed. Whole words only: a word is a run of letters, so
# an ending the lists lack ("हज़ारों") gets through. The lists are not complete.
_NUMBER_WORDS = {
    "en": (
        "zero two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
        "seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred hundreds "
        "thousand thousands lakh lakhs lac lacs crore crores million millions billion billions percent "
        "rupee rupees half halves dozen dozens twice thrice"
    ).split(),
    "hi": (
        "दस बीस तीस चालीस पचास साठ सत्तर अस्सी नब्बे सौ हज़ार हजार हज़ारों हजारों लाख लाखों करोड़ करोड करोड़ों "
        "प्रतिशत फ़ीसदी फीसदी रुपये रुपए रुपया रूपये आधा आधी आधे तीन चार पाँच पांच छह छः सात आठ नौ ग्यारह बारह"
    ).split(),
    "mr": (
        "दहा वीस तीस चाळीस पन्नास साठ सत्तर ऐंशी नव्वद शंभर हजार हजारो लाख लाखो कोटी टक्के टक्का रुपये रुपया "
        "अर्धा दोन तीन चार पाच सहा सात आठ नऊ"
    ).split(),
    "bn": (
        "দশ বিশ ত্রিশ চল্লিশ পঞ্চাশ ষাট সত্তর আশি শত একশ একশো হাজার লাখ লক্ষ কোটি শতাংশ শতকরা টাকা "
        "আধা অর্ধেক দুই তিন চার পাঁচ ছয় সাত আট"
    ).split(),
    "ta": (
        "பத்து இருபது முப்பது நாற்பது ஐம்பது அறுபது எழுபது எண்பது தொண்ணூறு நூறு ஆயிரம் ஆயிரத்து லட்சம் "
        "லட்சத்து கோடி சதவீதம் சதவிகிதம் ரூபாய் பாதி இரண்டு மூன்று நான்கு ஐந்து ஏழு எட்டு ஒன்பது"
    ).split(),
    "te": (
        "పది ఇరవై ముప్పై నలభై యాభై అరవై డెబ్బై ఎనభై తొంభై వంద వందల వేయి వెయ్యి వేలు వేల లక్ష లక్షలు కోటి కోట్లు "
        "శాతం రూపాయి రూపాయలు సగం రెండు మూడు నాలుగు ఐదు ఎనిమిది తొమ్మిది"
    ).split(),
    "kn": (
        "ಹತ್ತು ಇಪ್ಪತ್ತು ಮೂವತ್ತು ನಲವತ್ತು ಐವತ್ತು ಅರವತ್ತು ಎಪ್ಪತ್ತು ಎಂಬತ್ತು ತೊಂಬತ್ತು ನೂರು ಸಾವಿರ ಸಾವಿರಾರು ಲಕ್ಷ "
        "ಲಕ್ಷಗಳು ಕೋಟಿ ಶೇಕಡಾ ಶೇಕಡ ರೂಪಾಯಿ ರೂಪಾಯಿಗಳು ಅರ್ಧ ಎರಡು ಮೂರು ನಾಲ್ಕು ಐದು ಎಂಟು ಒಂಬತ್ತು"
    ).split(),
    "ml": (
        "പത്ത് ഇരുപത് മുപ്പത് അമ്പത് അറുപത് എഴുപത് തൊണ്ണൂറ് നൂറ് ആയിരം ലക്ഷം കോടി ശതമാനം രൂപ പകുതി "
        "രണ്ട് മൂന്ന് നാല് അഞ്ച് എട്ട് ഒമ്പത്"
    ).split(),
}

# NFC, because the check reads NFC and typed Indic text may be either form of a
# letter with a nukta.
NUMBER_WORDS = {
    language: frozenset(unicodedata.normalize("NFC", word) for word in words)
    for language, words in _NUMBER_WORDS.items()
}
ALL_NUMBER_WORDS = frozenset().union(*NUMBER_WORDS.values())


def _words(text: str):
    # Runs of letters and the marks that belong to them; anything else splits.
    def in_word(character):
        return unicodedata.category(character)[0] in "LM" or character in JOINERS

    return ["".join(run) for inside, run in groupby(text, in_word) if inside]


def _tidy(text: str):
    # Spacing and the spelling of a placeholder: the only things changed. That
    # includes the space the live model leaves before a danda ("है ।").
    text = unicodedata.normalize("NFC", " ".join(text.split()))
    text = re.sub(r"\s+।", "।", text)
    return PLACEHOLDER.sub(lambda found: _tag(found.group(1)), text)


def _character_problems(text: str, language: str):
    script, found = SCRIPT[language], set()
    for character in text:
        kind = unicodedata.category(character)[0]
        if kind == "N":
            found.add("digit")
        elif kind in "LM":
            if not unicodedata.name(character, "").startswith(script):
                found.add("wrong_script")
        elif character in PUNCTUATION or character in " {}":
            continue
        elif character in JOINERS and language != "en":
            continue
        else:
            found.add("bad_character")
    return sorted(found)


def _number_words(text: str, language: str):
    words = ("".join(c for c in word if c not in JOINERS) for word in _words(text))
    if language == "en":
        words = (word.lower() for word in words)
    return list(dict.fromkeys(word for word in words if word in NUMBER_WORDS[language]))


def _english_problems(text: str):
    # `text` has an x where each placeholder was.
    problems = []
    if re.search(r"\b[A-Z]{2,}\b", text):
        problems.append("acronym")
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if any(word[0].isupper() and word not in ALLOWED_CAPITALS for word in _words(sentence)[1:]):
            problems.append("capital")
            break
    return problems


def _problems(text: str, language: str):
    if not text:
        return ["empty"]
    reasons = ["long"] if len(text) > MAX_PART_LENGTH else []
    plain = NAMED.sub(" ", text)
    if "{" in plain or "}" in plain:
        reasons.append("braces")
    reasons += _character_problems(plain, language)
    if LINK.search(plain):
        reasons.append("link")
    reasons += [f"number_word:{word}" for word in _number_words(plain, language)]
    if language == "en":
        reasons += _english_problems(NAMED.sub("x", text))
    return reasons


def _is_the_asked_for_shape(reply):
    return (
        isinstance(reply, dict)
        and set(reply) == {"summary", "steps", "cautions"}
        and isinstance(reply["summary"], str)
        and all(
            isinstance(reply[key], list) and all(isinstance(item, str) for item in reply[key])
            for key in ("steps", "cautions")
        )
    )


def verify_plan(reply, context: dict, language: str):
    """
    The plan, with its spacing tidied, or BadPlan with every reason it was
    refused for. The reply is not changed. `language` must be one of LANGUAGES.
    """
    if not _is_the_asked_for_shape(reply):
        raise BadPlan(["shape"])

    plan = {
        "summary": _tidy(reply["summary"]),
        "steps": [_tidy(step) for step in reply["steps"]],
        "cautions": [_tidy(caution) for caution in reply["cautions"]],
    }
    texts = [plan["summary"], *plan["steps"], *plan["cautions"]]
    reasons = []
    if not (MIN_STEPS <= len(plan["steps"]) <= MAX_STEPS and MIN_CAUTIONS <= len(plan["cautions"]) <= MAX_CAUTIONS):
        reasons.append("count")
    for text in texts:
        reasons += _problems(text, language)

    used = [name for text in texts for name in NAMED.findall(text)]
    reasons += [f"placeholder:{name}" for name in dict.fromkeys(used) if name not in context["values"]]
    reasons += [f"missing:{name}" for name in context["required"] if name not in used]
    if len(set(used)) < min(MIN_FIGURES, len(context["values"])):
        reasons.append("few_placeholders")

    if reasons:
        raise BadPlan(list(dict.fromkeys(reasons)))
    return plan


# --- the plan with the figures put in -----------------------------------------


def _segments(text: str, values: dict):
    # [{"t": "text", "v": ...}, {"t": "fill", "v": ...}, ...]: the fills are the
    # rules' figures, so the page can set them apart from the model's words.
    pieces = re.split(r"(\{\{[A-Za-z_]+\}\})", text)
    return [
        {"t": "fill", "v": values[piece[2:-2]]} if index % 2 else {"t": "text", "v": piece}
        for index, piece in enumerate(pieces)
        if piece
    ]


def render_plan(plan: dict, context: dict):
    """A verified plan as lists of text and figure segments."""
    values = context["values"]
    return {
        "summary": _segments(plan["summary"], values),
        "steps": [_segments(step, values) for step in plan["steps"]],
        "cautions": [_segments(caution, values) for caution in plan["cautions"]],
    }
