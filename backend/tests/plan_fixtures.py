"""What the AI plan's tests share: one typical set of answers, the analysis it gives, and a plan a model could write about it in each language.

The plans below are test data, not translations anyone has reviewed. They are
short, they use only the placeholders the typical case offers, and each one has
to pass services.plan_service.verify_plan, which is what the tests check.
"""

import unicodedata

from app.services.analysis_service import run_unified_analysis


# A tailor in rural Lucknow who needs ₹90,000 and has ₹20,000. The rules find a
# profit of ₹15,000 a month and a gap of ₹70,000, and recommend the 24-month loan.
TYPICAL = {
    "business_category": "tailoring",
    "state": "Uttar Pradesh",
    "district": "Lucknow",
    "location_type": "rural",
    "available_capital": 20000,
    "monthly_expenses": 15000,
    "expected_monthly_revenue": 30000,
    "monthly_emi": 0,
    "initial_investment": 90000,
    "monthly_operating_expenses": 12000,
    "existing_debt": 0,
    "household_monthly_income": 25000,
}


def analyse(**changes):
    """The answers (TYPICAL with `changes`) and the analysis the rules make of them."""
    answers = {**TYPICAL, **changes}
    return answers, run_unified_analysis(**answers)


# Every language's plan uses the same six placeholders, which are the ones
# TYPICAL requires: profit, gap, loan, tenure, repayment and scheme_a.
GOOD_PLANS = {
    "en": {
        "summary": "Your business earns {{profit}} each month after costs, but you still need {{gap}} to start it.",
        "steps": [
            "Think about a loan of {{loan}} over {{tenure}} months, with a monthly repayment of {{repayment}}.",
            "Ask the nearest office about {{scheme_a}} before you borrow.",
            "Keep a written record of what you earn and spend each month.",
        ],
        "cautions": ["These figures are estimates, so check them with a lender before you decide."],
    },
    "hi": {
        "summary": "आपका व्यापार खर्च के बाद हर महीने {{profit}} कमाता है, पर शुरू करने के लिए अभी {{gap}} और चाहिए।",
        "steps": [
            "{{tenure}} महीनों के लिए {{loan}} का कर्ज़ लेने पर सोचें, हर महीने की किस्त {{repayment}} होगी।",
            "कर्ज़ लेने से पहले पास के दफ़्तर में {{scheme_a}} के बारे में पूछें।",
            "हर महीने की कमाई और खर्च लिखकर रखें।",
        ],
        "cautions": ["ये आँकड़े अनुमान हैं, इसलिए फ़ैसला करने से पहले किसी बैंक से जाँच लें।"],
    },
    "mr": {
        "summary": "तुमचा व्यवसाय खर्चानंतर दर महिन्याला {{profit}} कमावतो, पण सुरू करण्यासाठी अजून {{gap}} हवे आहेत.",
        "steps": [
            "{{tenure}} महिन्यांसाठी {{loan}} कर्ज घेण्याचा विचार करा, दरमहा हप्ता {{repayment}} असेल.",
            "कर्ज घेण्यापूर्वी जवळच्या कार्यालयात {{scheme_a}} बद्दल विचारा.",
            "दर महिन्याची कमाई आणि खर्च लिहून ठेवा.",
        ],
        "cautions": ["हे आकडे अंदाज आहेत, म्हणून निर्णय घेण्यापूर्वी बँकेकडून तपासा."],
    },
    "bn": {
        "summary": "খরচের পর আপনার ব্যবসা প্রতি মাসে {{profit}} আয় করে, কিন্তু শুরু করতে আরও {{gap}} দরকার।",
        "steps": [
            "{{tenure}} মাসের জন্য {{loan}} ঋণ নেওয়ার কথা ভাবুন, মাসিক কিস্তি হবে {{repayment}}।",
            "ঋণ নেওয়ার আগে কাছের অফিসে {{scheme_a}} সম্পর্কে জিজ্ঞাসা করুন।",
            "প্রতি মাসের আয় ও খরচ লিখে রাখুন।",
        ],
        "cautions": ["এই হিসাব আন্দাজ, তাই সিদ্ধান্ত নেওয়ার আগে ব্যাংক থেকে যাচাই করুন।"],
    },
    "ta": {
        "summary": "செலவுகளுக்குப் பிறகு உங்கள் தொழில் மாதந்தோறும் {{profit}} சம்பாதிக்கிறது, ஆனால் தொடங்க இன்னும் {{gap}} தேவை.",
        "steps": [
            "{{tenure}} மாதங்களுக்கு {{loan}} கடன் வாங்குவதைப் பற்றி யோசியுங்கள், மாதாந்திர தவணை {{repayment}} ஆகும்.",
            "கடன் வாங்கும் முன் அருகிலுள்ள அலுவலகத்தில் {{scheme_a}} பற்றிக் கேளுங்கள்.",
            "ஒவ்வொரு மாதமும் வருமானத்தையும் செலவையும் எழுதி வையுங்கள்.",
        ],
        "cautions": ["இந்த எண்கள் மதிப்பீடுகள், எனவே முடிவு செய்வதற்கு முன் வங்கியில் சரிபார்க்கவும்."],
    },
    "te": {
        "summary": "ఖర్చుల తర్వాత మీ వ్యాపారం ప్రతి నెలా {{profit}} సంపాదిస్తుంది, కానీ ప్రారంభించడానికి ఇంకా {{gap}} కావాలి.",
        "steps": [
            "{{tenure}} నెలలకు {{loan}} రుణం తీసుకోవడం గురించి ఆలోచించండి, నెలవారీ వాయిదా {{repayment}} అవుతుంది.",
            "రుణం తీసుకునే ముందు దగ్గరలోని కార్యాలయంలో {{scheme_a}} గురించి అడగండి.",
            "ప్రతి నెలా ఆదాయం, ఖర్చు రాసి ఉంచండి.",
        ],
        "cautions": ["ఈ లెక్కలు అంచనాలు మాత్రమే, కాబట్టి నిర్ణయం తీసుకునే ముందు బ్యాంకులో సరిచూసుకోండి."],
    },
    "kn": {
        "summary": "ಖರ್ಚಿನ ನಂತರ ನಿಮ್ಮ ವ್ಯಾಪಾರ ಪ್ರತಿ ತಿಂಗಳು {{profit}} ಗಳಿಸುತ್ತದೆ, ಆದರೆ ಆರಂಭಿಸಲು ಇನ್ನೂ {{gap}} ಬೇಕು.",
        "steps": [
            "{{tenure}} ತಿಂಗಳಿಗೆ {{loan}} ಸಾಲ ತೆಗೆದುಕೊಳ್ಳುವ ಬಗ್ಗೆ ಯೋಚಿಸಿ, ತಿಂಗಳ ಕಂತು {{repayment}} ಆಗುತ್ತದೆ.",
            "ಸಾಲ ತೆಗೆದುಕೊಳ್ಳುವ ಮೊದಲು ಹತ್ತಿರದ ಕಚೇರಿಯಲ್ಲಿ {{scheme_a}} ಬಗ್ಗೆ ಕೇಳಿ.",
            "ಪ್ರತಿ ತಿಂಗಳ ಆದಾಯ ಮತ್ತು ಖರ್ಚನ್ನು ಬರೆದಿಡಿ.",
        ],
        "cautions": ["ಈ ಲೆಕ್ಕಗಳು ಅಂದಾಜುಗಳು, ಆದ್ದರಿಂದ ನಿರ್ಧಾರ ಮಾಡುವ ಮೊದಲು ಬ್ಯಾಂಕಿನಲ್ಲಿ ಪರಿಶೀಲಿಸಿ."],
    },
    "ml": {
        "summary": "ചെലവുകൾക്കു ശേഷം നിങ്ങളുടെ ബിസിനസ് ഓരോ മാസവും {{profit}} നേടുന്നു, പക്ഷേ തുടങ്ങാൻ ഇനിയും {{gap}} വേണം.",
        "steps": [
            "{{tenure}} മാസത്തേക്ക് {{loan}} വായ്പ എടുക്കുന്നതിനെക്കുറിച്ച് ചിന്തിക്കുക, പ്രതിമാസ തിരിച്ചടവ് {{repayment}} ആയിരിക്കും.",
            "വായ്പ എടുക്കുന്നതിനു മുൻപ് അടുത്തുള്ള ഓഫീസിൽ {{scheme_a}} നെക്കുറിച്ച് ചോദിക്കുക.",
            "ഓരോ മാസത്തെയും വരുമാനവും ചെലവും എഴുതി സൂക്ഷിക്കുക.",
        ],
        "cautions": ["ഈ കണക്കുകൾ ഏകദേശമാണ്, അതിനാൽ തീരുമാനിക്കുന്നതിനു മുൻപ് ബാങ്കിൽ പരിശോധിക്കുക."],
    },
}


def good_plan(language="en"):
    """A fresh copy of the plan for TYPICAL in `language`, for a test to spoil one part of."""
    plan = GOOD_PLANS[language]

    def nfc(text):
        # Typed Indic text may be in either form of a nukta letter; the check
        # reads one form, so the fixtures are written down in that form.
        return unicodedata.normalize("NFC", text)

    return {"summary": nfc(plan["summary"]), "steps": [nfc(s) for s in plan["steps"]], "cautions": [nfc(c) for c in plan["cautions"]]}
