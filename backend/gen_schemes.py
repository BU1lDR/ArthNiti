"""One-off generator for app/data/schemes.json.

Kept out of the app package on purpose: nothing imports it at runtime. It exists
because schemes.json now carries a translation code beside every sentence, and
hand-editing 29 schemes across four parallel code arrays is how the arrays fall
out of step. Here the code and the English are written once, together, and the
arrays are derived — so `len(eligibility_codes) == len(eligibility_rules)` is
structurally true rather than something a test has to catch.

Run from ./backend:  ../.venv/Scripts/python.exe gen_schemes.py
"""

import io
import json
import os

# Shared eligibility phrasings, reused across schemes. Formal English here
# because this is scheme data; backendStrings.js carries the plain-language
# version a low-literacy reader actually sees.
S = {
    "elig.common.age18": "The applicant must be at least 18 years old.",
    "elig.common.age18to45": "The applicant must generally be between 18 and 45 years of age.",
    "elig.common.age21to40": "The applicant must generally be between 21 and 40 years of age.",
    "elig.common.residentState": "The applicant must be a resident of the state.",
    "elig.common.womenOnly": "Only women applicants are eligible.",
    "elig.common.newUnit": "The unit must be new, not an existing or transferred unit.",
    "elig.common.bankApproval": "Final sanction rests with the financing bank.",
    "elig.common.askLocalOffice": "Rates and conditions vary by location, so confirm them at the local office.",
    "elig.common.freeOfCost": "No fee is charged for this assistance.",
    "elig.common.smallFee": "A small fixed service charge applies for each service.",
    "elig.common.aadhaarBank": "An Aadhaar card and a bank account in the applicant's own name are required.",
    "elig.common.udyamNeeded": "Udyam registration is required.",
    "elig.common.trainingIncluded": "Training forms part of the scheme.",
    "elig.common.ownContribution10": "The applicant must contribute at least 10% of the project cost.",
    "elig.common.class8": "The applicant must have passed at least class 8, or hold a recognised skill training certificate.",
    "elig.common.ruralArea": "The applicant must be from a rural area of the district.",
    "elig.common.urbanArea": "The activity must be in a town or city area covered by an urban local body.",
    "elig.common.farmerOrLabourer": "Farmers, farm labourers and farm groups of the area are eligible.",
    "elig.common.shgMember": "Membership of a self-help group is required.",
    "elig.common.noCollateral": "No collateral has to be pledged.",
    "elig.common.traditionalTrade": "The applicant must work in a traditional trade using hand tools.",
    "elig.common.anyoneInArea": "Anyone carrying on or planning work in the area may approach the office.",
}

D = {
    "doc.identity": "Identity proof",
    "doc.address": "Address proof",
    "doc.businessDetails": "Business/project details",
    "doc.businessInfo": "Business/project information",
    "doc.bank": "Bank-related documents",
    "doc.projectReport": "Project report",
    "doc.education": "Educational or training documents where applicable",
    "doc.aadhaar": "Aadhaar card",
    "doc.photo": "Recent passport-size photograph",
    "doc.caste": "Caste certificate, where applicable",
    "doc.income": "Income certificate",
    "doc.domicile": "Domicile or residence certificate for the state",
    "doc.quotation": "Quotations for machinery, tools or equipment",
    "doc.landOrRent": "Ownership or rent agreement for the work premises",
    "doc.udyam": "Udyam registration number, where already held",
    "doc.gpRecommendation": "Verification letter from the Gram Panchayat or urban local body",
    "doc.shgMembership": "Proof of self-help group membership",
    "doc.landRecord": "Land record extract",
    "doc.livestockDetails": "Details of livestock held or planned",
    "doc.vendingCertificate": "Certificate of vending or the local body survey letter",
    "doc.mobile": "Working mobile number linked to Aadhaar",
}

# Category vocabulary. Two traps, both load-bearing:
#   - the matcher tests `scheme_category in user_phrase`, so a scheme must never
#     say "livestock": CATEGORY_SYNONYMS maps livestock -> dairy, not the
#     reverse, so a dairy user would miss it. List dairy/poultry outright.
#   - never use "other": for the Other button the frontend sends the user's own
#     typed text, never the literal string "other".
MFG = "manufacturing"
SVC = "services"
TRD = "trading"
FP = "food processing"
HC = "handicrafts"
TLR = "tailoring"
AGR = "agriculture"
DRY = "dairy"
PLT = "poultry"
BEE = "beekeeping"
SV = "street vending"

GENERAL = [MFG, SVC, TRD, FP, HC, TLR]
ALL_WORK = [MFG, SVC, TRD, FP, HC, TLR, AGR, DRY, PLT, BEE]
NE8 = [
    "Arunachal Pradesh", "Assam", "Manipur", "Meghalaya",
    "Mizoram", "Nagaland", "Sikkim", "Tripura",
]
BORDER = [
    "Arunachal Pradesh", "Sikkim", "Uttarakhand",
    "Himachal Pradesh", "Ladakh", "Jammu and Kashmir",
]

# (id, name, level, states, categories, target, description, support,
#  eligibility (shared code, or (code, text) for a scheme-specific one),
#  document codes, url)
#
# The trailing url is the source each scheme's rules were transcribed from. It
# is a citation for us, not data: build() does not emit it, schemes.json does
# not carry it, and nothing in the app links a reader to a government portal.
SPEC = [
    # ------------------------------- CENTRAL -------------------------------
    (
        "pmfme",
        "Pradhan Mantri Formalisation of Micro Food Processing Enterprises (PMFME)",
        "central", ["ALL"], [FP, "food manufacturing", "agri-food processing"],
        "Micro food processing enterprises",
        "Provides support for eligible micro food processing enterprises, including credit-linked capital subsidy for individual micro food processing units.",
        "Credit-linked capital subsidy",
        [
            ("elig.pmfme.activity", "Applicant should be involved in an eligible micro food processing activity."),
            ("elig.pmfme.subsidy", "Individual micro food processing units may receive credit-linked capital subsidy of 35% of eligible project cost, subject to a maximum of Rs.10 lakh per unit."),
            ("elig.pmfme.contribution", "Beneficiary contribution should be at least 10% of the project cost."),
        ],
        ["doc.identity", "doc.address", "doc.businessDetails", "doc.bank", "doc.projectReport"],
        "https://www.mofpi.gov.in/en/pmfme/shgs-fpos-co-operatives-individual-micro-food-enterprise",
    ),
    (
        "pmegp",
        "Prime Minister's Employment Generation Programme (PMEGP)",
        "central", ["ALL"], [MFG, SVC, TRD],
        "New micro-enterprises",
        "A credit-linked subsidy programme supporting eligible new micro-enterprises in manufacturing and service/trading activities.",
        "Credit-linked margin money subsidy",
        [
            ("elig.pmegp.guidelines", "The applicant must satisfy the eligibility conditions specified in the current PMEGP guidelines."),
            ("elig.pmegp.maxManufacturing", "Maximum project cost for manufacturing units is Rs.50 lakh."),
            ("elig.pmegp.maxService", "Maximum project cost for service/trading units is Rs.20 lakh."),
            ("elig.pmegp.financing", "Bank financing and beneficiary contribution are subject to the applicable PMEGP guidelines."),
        ],
        ["doc.identity", "doc.address", "doc.projectReport", "doc.education", "doc.bank"],
        "https://www.kviconline.gov.in/pmegpeportal/",
    ),
    (
        "pmmy",
        "Pradhan Mantri MUDRA Yojana (PMMY)",
        "central", ["ALL"], [MFG, TRD, SVC, DRY, PLT, BEE],
        "Micro enterprises",
        "Provides collateral-free institutional credit to eligible micro enterprises for income-generating activities.",
        "Collateral-free business loan",
        [
            ("elig.pmmy.activity", "Loans are intended for eligible non-agricultural income-generating micro enterprise activities, including specified allied agricultural activities."),
            ("elig.pmmy.shishu", "Shishu loans are up to Rs.50,000."),
            ("elig.pmmy.kishore", "Kishore loans are above Rs.50,000 and up to Rs.5 lakh."),
            ("elig.pmmy.tarun", "Tarun loans are above Rs.5 lakh and up to Rs.10 lakh."),
            ("elig.pmmy.tarunPlus", "Tarun Plus loans are above Rs.10 lakh and up to Rs.20 lakh for entrepreneurs who have successfully repaid a previous Tarun-category loan."),
        ],
        ["doc.identity", "doc.address", "doc.businessInfo", "doc.bank"],
        "https://financialservices.gov.in/pradhan-mantri-mudra-yojana-pmmy",
    ),
    (
        "pmvishwakarma",
        "PM Vishwakarma",
        "central", ["ALL"], [MFG, SVC, HC, TLR],
        "Traditional artisans and craftspeople working with hand tools",
        "Support for traditional artisans and craftspeople: skill training with a daily stipend, a toolkit incentive, and collateral-free credit at a concessional rate of interest.",
        "Toolkit incentive, training stipend and concessional credit",
        [
            "elig.common.traditionalTrade",
            ("elig.pmvishwakarma.trades", "The applicant must work in one of the 18 trades covered by the scheme, such as tailoring, pottery, blacksmithy, carpentry, hair cutting, goldsmithy, basket weaving or cobbling."),
            ("elig.pmvishwakarma.toolkit", "A toolkit incentive of Rs.15,000 is available after basic skill training."),
            ("elig.pmvishwakarma.loan", "Collateral-free credit of up to Rs.1 lakh in the first tranche and up to Rs.2 lakh in the second, at 5% interest."),
            "elig.common.age18",
        ],
        ["doc.aadhaar", "doc.bank", "doc.address", "doc.photo", "doc.gpRecommendation"],
        "https://pmvishwakarma.gov.in/",
    ),
    (
        "standupindia",
        "Stand-Up India",
        "central", ["ALL"], [MFG, SVC, TRD, AGR],
        "First-time women, Scheduled Caste and Scheduled Tribe entrepreneurs",
        "Bank loans between Rs.10 lakh and Rs.1 crore for a first enterprise set up by a woman entrepreneur, or by an entrepreneur from a Scheduled Caste or Scheduled Tribe community.",
        "Bank loan for a first-time enterprise",
        [
            ("elig.standupindia.who", "The enterprise must be majority owned and controlled by a woman, or by a person from a Scheduled Caste or Scheduled Tribe community."),
            ("elig.standupindia.amount", "The loan size ranges from Rs.10 lakh to Rs.1 crore."),
            "elig.common.newUnit",
            ("elig.standupindia.agriAllied", "Activities allied to agriculture, such as dairy, poultry and food processing, are covered; crop cultivation on its own is not."),
        ],
        ["doc.identity", "doc.address", "doc.caste", "doc.projectReport", "doc.bank"],
        "https://www.standupmitra.in/",
    ),
    (
        "nlm",
        "National Livestock Mission - Entrepreneurship Development",
        "central", ["ALL"], [PLT, AGR],
        "Poultry, small ruminant, piggery and fodder entrepreneurs",
        "Capital subsidy that does not have to be repaid, of up to half the project cost, for setting up poultry, sheep and goat, piggery, or feed and fodder units.",
        "Capital subsidy of up to half the project cost",
        [
            ("elig.nlm.activities", "Covers poultry, sheep and goat rearing, piggery, and feed and fodder units."),
            ("elig.nlm.subsidy", "Up to 50% of the project cost is given as a subsidy that is not repaid, subject to a ceiling of Rs.50 lakh."),
            ("elig.nlm.training", "Relevant training or experience in the activity, and land for the unit, are required."),
            "elig.common.bankApproval",
        ],
        ["doc.identity", "doc.address", "doc.projectReport", "doc.landOrRent", "doc.livestockDetails", "doc.bank"],
        "https://nlm.udyamimitra.in/",
    ),
    (
        "ahidf",
        "Animal Husbandry Infrastructure Development Fund (AHIDF)",
        "central", ["ALL"], [DRY, PLT, FP],
        "Dairy, meat and animal feed processing units",
        "A bank loan on which the government pays part of the interest, for setting up milk chilling and milk product units, meat processing units, and animal feed plants.",
        "Bank loan with 3% of the interest paid by government",
        [
            ("elig.ahidf.purpose", "Covers milk chilling and dairy product units, meat processing units, and animal feed plants."),
            ("elig.ahidf.subvention", "An interest subvention of 3% is available for up to eight years."),
            "elig.common.ownContribution10",
        ],
        ["doc.identity", "doc.projectReport", "doc.landOrRent", "doc.bank", "doc.udyam"],
        "https://ahidf.udyamimitra.in/",
    ),
    (
        "aif",
        "Agriculture Infrastructure Fund (AIF)",
        "central", ["ALL"], [AGR, FP, DRY],
        "Post-harvest and primary processing projects",
        "A loan of up to Rs.2 crore on which the government pays 3% of the interest, for storage, cold rooms, grading and packing, and small units that process farm produce.",
        "Loan with 3% of the interest paid by government",
        [
            ("elig.aif.purpose", "Covers post-harvest work such as storage, cold rooms, grading and packing houses, and primary processing units."),
            ("elig.aif.subvention", "Interest subvention of 3% applies on a loan of up to Rs.2 crore, for up to seven years."),
            ("elig.aif.who", "Farmers, self-help groups, farmer producer organisations and micro enterprises may apply."),
        ],
        ["doc.identity", "doc.landRecord", "doc.projectReport", "doc.quotation", "doc.bank"],
        "https://agriinfra.dac.gov.in/",
    ),
    (
        "kcc",
        "Kisan Credit Card (KCC)",
        "central", ["ALL"], [AGR, DRY, PLT],
        "Farmers, tenant farmers and share-croppers",
        "A card from your bank for short-term borrowing at a concessional rate of interest, repayable after harvest. Animal husbandry and fisheries are also covered.",
        "Concessional short-term credit from your bank",
        [
            ("elig.kcc.who", "Available to land-owning farmers, tenant farmers, share-croppers and joint liability groups."),
            ("elig.kcc.rate", "Interest is 7% on credit up to Rs.3 lakh, reduced to 4% on timely repayment."),
            ("elig.kcc.animal", "Animal husbandry and fisheries are covered up to Rs.2 lakh."),
        ],
        ["doc.identity", "doc.address", "doc.landRecord", "doc.photo", "doc.bank"],
        "https://www.nabard.org/",
    ),

    # ----------------------------- STATE / UT ------------------------------
    (
        "up_myuva",
        "Mukhyamantri Yuva Udyami Vikas Abhiyan (MYUVA), Uttar Pradesh",
        "state", ["Uttar Pradesh"], GENERAL,
        "Young first-generation entrepreneurs in Uttar Pradesh",
        "For young people in Uttar Pradesh starting their own enterprise: a project of up to Rs.5 lakh financed on an interest-free basis, arranged through the District Industries Centre.",
        "Interest-free loan of up to Rs.5 lakh",
        [
            "elig.common.age21to40",
            "elig.common.class8",
            ("elig.myuva.amount", "Project cost of up to Rs.5 lakh is financed, with no interest payable by the beneficiary for the stated period."),
            "elig.common.residentState",
        ],
        ["doc.identity", "doc.address", "doc.domicile", "doc.education", "doc.projectReport", "doc.bank"],
        "https://msme.up.gov.in/",
    ),
    (
        "up_vssy",
        "Vishwakarma Shram Samman Yojana, Uttar Pradesh",
        "state", ["Uttar Pradesh"], [MFG, SVC, HC, TLR],
        "Traditional artisans in Uttar Pradesh",
        "Six days of free skill training and a free toolkit for traditional workers in Uttar Pradesh - tailors, potters, blacksmiths, carpenters, barbers, cobblers and others.",
        "Free skill training and a free toolkit",
        [
            "elig.common.traditionalTrade",
            ("elig.vssy.trades", "Covers traditional trades such as tailoring, pottery, blacksmithy, carpentry, hair cutting and shoe making."),
            "elig.common.age18",
            "elig.common.residentState",
            "elig.common.freeOfCost",
        ],
        ["doc.identity", "doc.address", "doc.domicile", "doc.photo", "doc.bank"],
        "https://msme.up.gov.in/",
    ),
    (
        "mh_cmegp",
        "Chief Minister's Employment Generation Programme (CMEGP), Maharashtra",
        "state", ["Maharashtra"], GENERAL,
        "New micro and small units in Maharashtra",
        "For new small units in Maharashtra: a bank loan with 15% to 35% of the project cost provided as a subsidy that is not repaid.",
        "Bank loan with part of the project cost as subsidy",
        [
            "elig.common.age18to45",
            ("elig.cmegp.limits", "Project cost may go up to Rs.50 lakh for manufacturing and Rs.10 lakh for service activities."),
            ("elig.cmegp.subsidy", "A subsidy of 15% to 35% of project cost applies, depending on the applicant category and the location of the unit."),
            "elig.common.newUnit",
        ],
        ["doc.identity", "doc.address", "doc.domicile", "doc.education", "doc.projectReport", "doc.bank"],
        "https://maha-cmegp.gov.in/",
    ),
    (
        "tn_needs",
        "New Entrepreneur cum Enterprise Development Scheme (NEEDS), Tamil Nadu",
        "state", ["Tamil Nadu"], [MFG, SVC, FP, HC, TLR],
        "Educated first-generation entrepreneurs in Tamil Nadu",
        "For educated young people in Tamil Nadu setting up a unit: business training, a bank loan, and 25% of the project cost as a subsidy that is not repaid.",
        "Training, bank loan and a 25% subsidy",
        [
            ("elig.needs.who", "The applicant must be at least 21 years old and hold a degree, diploma or ITI qualification."),
            ("elig.needs.subsidy", "A capital subsidy of 25% of the project cost applies, on project cost of up to Rs.75 lakh."),
            "elig.common.trainingIncluded",
            "elig.common.residentState",
        ],
        ["doc.identity", "doc.address", "doc.domicile", "doc.education", "doc.projectReport", "doc.bank"],
        "https://www.msmeonline.tn.gov.in/",
    ),
    (
        "kl_ess",
        "Entrepreneur Support Scheme (ESS), Kerala",
        "state", ["Kerala"], [MFG, FP, HC, TLR],
        "Micro and small manufacturing units in Kerala",
        "Kerala pays back part of what you spend on land, building, machinery and electric fitting for a small manufacturing unit - from 15% up to 45% for some groups of people.",
        "Part of your set-up spending paid back",
        [
            ("elig.ess.who", "Open to micro and small manufacturing units registered in Kerala."),
            ("elig.ess.rate", "Assistance ranges from 15% to 45% of eligible investment, with the higher rates for women, young entrepreneurs, and applicants from Scheduled Caste and Scheduled Tribe communities."),
            ("elig.ess.stage", "Part of the assistance may be claimed before commencement and the balance after the unit starts production."),
            "elig.common.udyamNeeded",
        ],
        ["doc.identity", "doc.udyam", "doc.landOrRent", "doc.quotation", "doc.bank"],
        "https://industry.kerala.gov.in/",
    ),
    (
        "wb_bcc",
        "Bhabishyat Credit Card, West Bengal",
        "state", ["West Bengal"], GENERAL,
        "Young entrepreneurs in West Bengal",
        "For young people in West Bengal starting their own work: a project of up to Rs.5 lakh, guaranteed by the state, with 10% of the cost given as a subsidy.",
        "State-guaranteed loan with a 10% subsidy",
        [
            "elig.common.age18to45",
            ("elig.bcc.amount", "Project cost of up to Rs.5 lakh is covered, and the state provides the credit guarantee."),
            ("elig.bcc.subsidy", "A subsidy of 10% of the project cost is provided and is not repaid."),
            "elig.common.residentState",
        ],
        ["doc.identity", "doc.address", "doc.domicile", "doc.projectReport", "doc.bank"],
        "https://wb.gov.in/",
    ),
    (
        "ka_udyogini",
        "Udyogini, Karnataka",
        "state", ["Karnataka"], [TRD, SVC, MFG, FP, HC, TLR],
        "Women entrepreneurs in Karnataka",
        "For women in Karnataka running or starting a small business: a loan of up to Rs.3 lakh, with part of it given as a subsidy for women from certain groups.",
        "Loan for women with part given as subsidy",
        [
            "elig.common.womenOnly",
            ("elig.udyogini.amount", "Loans of up to Rs.3 lakh are available for the listed categories of business."),
            ("elig.udyogini.subsidy", "A subsidy of 30% of the loan, up to Rs.90,000, applies for applicants from Scheduled Caste, Scheduled Tribe and other specified categories."),
            ("elig.udyogini.income", "A family income ceiling applies, except for widows and women with a disability."),
            "elig.common.residentState",
        ],
        ["doc.identity", "doc.address", "doc.income", "doc.caste", "doc.photo", "doc.bank"],
        "https://kswdc.karnataka.gov.in/",
    ),

    # ------------------------------ REGIONAL ------------------------------
    (
        "unnati_ner",
        "UNNATI 2024 - Uttar Poorva Transformative Industrialization Scheme",
        "regional", NE8, [MFG, FP, SVC, HC, TLR],
        "New and expanding units in the eight North Eastern states",
        "For new and growing units in the eight North Eastern states: money towards the cost of your building, plant and machinery, along with other production-linked support.",
        "Money towards your building, plant and machinery",
        [
            ("elig.unnati.where", "The unit must be located in one of the eight North Eastern states."),
            ("elig.unnati.support", "Capital investment incentive is provided towards plant, machinery and building, at a higher rate in the more remote districts."),
            ("elig.unnati.register", "Registration on the scheme portal is required before commencing the investment."),
            "elig.common.udyamNeeded",
        ],
        ["doc.identity", "doc.udyam", "doc.landOrRent", "doc.projectReport", "doc.quotation"],
        "https://dpiit.gov.in/",
    ),
    (
        "vvp_border",
        "Vibrant Villages Programme",
        "regional", BORDER, [DRY, HC, SVC, AGR, FP],
        "Villages in notified border blocks of the northern and north-eastern hills",
        "For villages in the notified border blocks of the northern and north-eastern hills: support to build local earning work such as home-stays, dairy and animal keeping, and craft.",
        "Support to build local earning work",
        [
            ("elig.vvp.where", "Only villages in the border blocks notified under the programme are covered."),
            ("elig.vvp.what", "Support is directed at home-stays and rural tourism, dairy and animal husbandry, craft, and small local enterprise."),
            "elig.common.askLocalOffice",
        ],
        ["doc.identity", "doc.address", "doc.gpRecommendation", "doc.projectReport"],
        "https://www.mha.gov.in/",
    ),

    # ------------------------------ DISTRICT ------------------------------
    (
        "dic",
        "District Industries Centre (DIC)",
        "district", ["ALL"], GENERAL,
        "Micro and small enterprises in the district",
        "The government office in your own district that registers small enterprises, sends your subsidy and loan applications on to the state and central schemes, and tells you which ones you qualify for.",
        "Free help with registration and scheme applications",
        [
            "elig.common.anyoneInArea",
            ("elig.dic.what", "The office handles Udyam registration, forwards applications under state and central schemes, and arranges entrepreneurship training."),
            "elig.common.freeOfCost",
        ],
        ["doc.identity", "doc.address", "doc.udyam", "doc.projectReport"],
        "https://msme.gov.in/",
    ),
    (
        "rseti",
        "Rural Self Employment Training Institute (RSETI)",
        "district", ["ALL"], ALL_WORK,
        "Rural youth in the district",
        "A free training institute in your district, run with the banks. You stay there for one to six weeks, learn a trade, and the institute then helps you apply for a loan and keeps following up.",
        "Free training with food and stay, and loan help after",
        [
            "elig.common.age18to45",
            "elig.common.ruralArea",
            ("elig.rseti.free", "Training, boarding and lodging are provided at no cost to the trainee."),
            ("elig.rseti.followUp", "After training the institute assists with the loan application and follows up for about two years."),
        ],
        ["doc.identity", "doc.address", "doc.photo", "doc.education"],
        "https://rural.gov.in/",
    ),
    (
        "kvk",
        "Krishi Vigyan Kendra (KVK)",
        "district", ["ALL"], [AGR, DRY, PLT, BEE, FP],
        "Farmers and rural workers in the district",
        "The farm science centre in your district. It gives free advice and short courses on dairy, poultry, beekeeping, mushroom growing and food making, and it tests your soil.",
        "Free training, advice and soil testing",
        [
            "elig.common.farmerOrLabourer",
            ("elig.kvk.what", "Short courses are run on animal husbandry, beekeeping, mushroom cultivation, food processing and seed production."),
            "elig.common.freeOfCost",
        ],
        ["doc.identity", "doc.address", "doc.landRecord"],
        "https://icar.org.in/",
    ),
    (
        "odop_up",
        "One District One Product (ODOP), Uttar Pradesh",
        "district", ["Uttar Pradesh"], [HC, TLR, FP, MFG],
        "Artisans and units working on their district's notified product",
        "Every district in Uttar Pradesh has one chosen craft or product. If your work is your district's product, you can get a toolkit, training, help selling at fairs, and margin money on a loan.",
        "Toolkit, training, help selling, and margin money",
        [
            ("elig.odop.product", "Your activity must be the product notified for your own district - ask your District Industries Centre which one it is."),
            ("elig.odop.toolkit", "Trained artisans receive a toolkit and may take part in state and national fairs."),
            ("elig.odop.margin", "A loan with margin money assistance is available under the ODOP financing component."),
            "elig.common.residentState",
        ],
        ["doc.identity", "doc.address", "doc.domicile", "doc.projectReport", "doc.bank"],
        "https://odopup.in/",
    ),

    # ---------------------------- SUB-DISTRICT ----------------------------
    (
        "tehsil_certificates",
        "Tehsil or Taluka office - certificates for scheme applications",
        "sub_district", ["ALL"], ALL_WORK,
        "Anyone applying to a government scheme",
        "Almost every scheme asks for an income, caste or residence certificate, and your tehsil or taluka office is what issues them. Get them before you apply anywhere else, or the application will be held up.",
        "The certificates other schemes ask you for",
        [
            ("elig.tehsil.what", "The office issues income, caste, residence and land-related certificates."),
            ("elig.tehsil.time", "A certificate is usually issued within a few working days once the papers are complete."),
            ("elig.tehsil.online", "Many states also accept these applications online or through a Common Service Centre."),
        ],
        ["doc.identity", "doc.address", "doc.photo", "doc.landRecord"],
        "https://services.india.gov.in/",
    ),
    (
        "subdiv_agri",
        "Sub-Divisional Agriculture Office",
        "sub_district", ["ALL"], [AGR, DRY, PLT, FP, BEE],
        "Farmers in the sub-division",
        "The agriculture office for your tehsil or sub-division. It sanctions the government share on seeds, hand tools, small machines and drip or sprinkler watering, and its staff come out to villages.",
        "Government share on farm tools and inputs",
        [
            "elig.common.farmerOrLabourer",
            ("elig.subdivAgri.what", "A share of the cost of seeds, hand tools, small farm machinery and micro-irrigation is met by the government."),
            "elig.common.askLocalOffice",
        ],
        ["doc.identity", "doc.landRecord", "doc.quotation", "doc.bank"],
        "https://agriwelfare.gov.in/",
    ),

    # ------------------------ BLOCK / TALUKA / CIRCLE ----------------------
    (
        "bdo_nrlm",
        "Block Development Office - rural livelihoods team",
        "block", ["ALL"], ALL_WORK,
        "Rural families and self-help group members in the block",
        "Your block office runs the rural livelihoods mission. Its team helps form self-help groups, gives a group its own money to lend to its members, and trains members to start small work.",
        "Group funds and training through your block",
        [
            ("elig.bdo.who", "Rural households are covered, in particular women joining a self-help group."),
            ("elig.bdo.funds", "A well-functioning group receives a revolving fund and a community investment fund to on-lend to its members."),
            ("elig.bdo.lakhpati", "The Lakhpati Didi effort supports women members in building annual earnings of a lakh or more."),
            "elig.common.shgMember",
        ],
        ["doc.identity", "doc.address", "doc.shgMembership", "doc.bank"],
        "https://rural.gov.in/",
    ),
    (
        "blbc",
        "Block Level Bankers' Committee (BLBC)",
        "block", ["ALL"], ALL_WORK,
        "Applicants whose scheme loan is stuck or refused",
        "Every block has a standing meeting of all its bank branches together with block officers. If a branch refuses or sits on your scheme loan without a clear reason, your case can be raised here.",
        "A place to take a refused or delayed scheme loan",
        [
            "elig.common.anyoneInArea",
            ("elig.blbc.how", "Ask your block office or bank branch for the date of the next meeting and how to place your case before it."),
            ("elig.blbc.meets", "The committee meets once a quarter and reviews the block credit plan and pending applications."),
        ],
        ["doc.identity", "doc.bank", "doc.projectReport"],
        "https://www.rbi.org.in/",
    ),
    (
        "atma_block",
        "ATMA - block farm technology team",
        "block", ["ALL"], [AGR, DRY, PLT, BEE, FP],
        "Farmers and farm groups in the block",
        "The block farm team under ATMA runs field demonstrations and farmer field schools, arranges study visits to other districts, and pays a small allowance while you train.",
        "Free farm training and study visits",
        [
            "elig.common.farmerOrLabourer",
            ("elig.atma.what", "Field demonstrations, farmer field schools, and sponsored study visits within and outside the district are provided."),
            ("elig.atma.friend", "Each village has a designated farmer friend who can be approached first."),
        ],
        ["doc.identity", "doc.address", "doc.landRecord"],
        "https://agriwelfare.gov.in/",
    ),

    # ------------------------- VILLAGE / URBAN BODY ------------------------
    (
        "gp_licence",
        "Gram Panchayat - trade permission and village plan",
        "local_body", ["ALL"], [MFG, SVC, TRD, FP, HC, TLR, DRY, PLT, BEE],
        "Work carried on within the Gram Panchayat area",
        "Your Gram Panchayat issues the no-objection letter and trade permission a village shop or small unit needs, and its yearly village plan can pay for a shed, water or an approach road to your work place.",
        "Trade permission and village plan works",
        [
            "elig.common.anyoneInArea",
            ("elig.gp.what", "The Panchayat issues a no-objection letter and trade permission, and verifies your papers for other schemes."),
            ("elig.gp.plan", "Ask for your requirement to be included in the yearly Gram Panchayat Development Plan at the Gram Sabha meeting."),
        ],
        ["doc.identity", "doc.address", "doc.landOrRent", "doc.photo"],
        "https://panchayat.gov.in/",
    ),
    (
        "csc",
        "Common Service Centre (CSC) - Digital Seva Kendra",
        "local_body", ["ALL"], ALL_WORK,
        "Anyone in the village or ward",
        "The village computer centre. The operator fills online scheme forms for you, scans your papers, and handles Aadhaar, bank and certificate work for a small fixed charge.",
        "Help to fill online scheme forms",
        [
            "elig.common.anyoneInArea",
            ("elig.csc.what", "The operator can register you under PM Vishwakarma, MUDRA and other schemes, and print the acknowledgement."),
            "elig.common.smallFee",
            "elig.common.aadhaarBank",
        ],
        ["doc.aadhaar", "doc.bank", "doc.photo", "doc.mobile"],
        "https://csc.gov.in/",
    ),
    (
        "svanidhi",
        "PM SVANidhi - through your urban local body",
        # Deliberately no "services": tailoring expands to manufacturing +
        # services, so listing services here matched every tailor to a street
        # vendor scheme. Vending is buying and selling, and a food cart is food
        # work, so those two stay.
        "local_body", ["ALL"], [TRD, FP, SV],
        "Street vendors in a town or city area",
        "For street vendors in a town or city. The vending certificate or survey letter from your local body gets you a working capital loan of Rs.10,000, then Rs.20,000, then Rs.50,000, with money back for repaying on time.",
        "Working capital loan for street vendors",
        [
            "elig.common.urbanArea",
            ("elig.svanidhi.who", "The vendor must have been covered by the local body vending survey, or hold a certificate of vending or a letter of recommendation."),
            ("elig.svanidhi.ladder", "The first loan is Rs.10,000; on timely repayment the next is Rs.20,000, and then Rs.50,000."),
            ("elig.svanidhi.cashback", "Digital transactions earn cash back, and timely repayment earns a 7% interest subsidy."),
            "elig.common.noCollateral",
        ],
        ["doc.identity", "doc.vendingCertificate", "doc.bank", "doc.aadhaar"],
        "https://pmsvanidhi.mohua.gov.in/",
    ),
]

# The three original schemes keep their own verification date. Everything added
# on 7 Sept 2026 carries that date, and the UI prints it on every card.
EXISTING_VERIFIED = {"pmfme": "2026-09-01", "pmegp": "2026-09-01", "pmmy": "2026-09-01"}
LAST_VERIFIED = "2026-09-07"


def build():
    out = []
    elig_seen = {}
    doc_seen = set()

    for (sid, name, level, states, cats, target, desc, support, eligs, docs, url) in SPEC:
        codes, texts = [], []

        for item in eligs:
            code, text = item if isinstance(item, tuple) else (item, S[item])
            if elig_seen.get(code, text) != text:
                raise SystemExit("eligibility code reused with different text: " + code)
            elig_seen[code] = text
            codes.append(code)
            texts.append(text)

        for code in docs:
            if code not in D:
                raise SystemExit("unknown document code: " + code)
            doc_seen.add(code)

        out.append(
            {
                "id": sid,
                "name": name,
                "description": desc,
                "target_segment": target,
                "business_categories": cats,
                "states": states,
                "level": level,
                "eligibility_rules": texts,
                "support_type": support,
                "documents": [D[code] for code in docs],
                # `url` is NOT emitted. It stays in SPEC as the internal
                # citation for where each scheme's rules were transcribed
                # from, but the dataset carries no official_url and the app
                # links no reader out to a government portal. Emitting it
                # here would put the field back into schemes.json on the next
                # regeneration, which is how it would return.
                "last_verified": EXISTING_VERIFIED.get(sid, LAST_VERIFIED),
                "eligibility_codes": codes,
                "document_codes": list(docs),
                "description_code": "sdata.%s.description" % sid,
                "support_type_code": "sdata.%s.support" % sid,
            }
        )

    return out, elig_seen, sorted(doc_seen)


def main():
    out, elig_seen, doc_seen = build()

    ids = [scheme["id"] for scheme in out]
    if len(set(ids)) != len(ids):
        raise SystemExit("duplicate scheme id")

    here = os.path.dirname(os.path.abspath(__file__))
    target = os.path.join(here, "app", "data", "schemes.json")

    with io.open(target, "w", encoding="utf-8") as handle:
        json.dump(out, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    levels = {}
    for scheme in out:
        levels[scheme["level"]] = levels.get(scheme["level"], 0) + 1

    categories = sorted({c for scheme in out for c in scheme["business_categories"]})

    print("schemes:", len(out))
    print("by level:", levels)
    print("categories:", categories)
    print("eligibility codes:", len(elig_seen))
    print("document codes:", len(doc_seen))
    print("sdata keys:", len(out) * 2)
    print("total translation keys:", len(elig_seen) + len(doc_seen) + len(out) * 2)

    with io.open(os.path.join(here, "gen_schemes_keys.json"), "w", encoding="utf-8") as handle:
        json.dump(
            {"eligibility": elig_seen, "documents": doc_seen, "ids": ids},
            handle,
            indent=1,
            ensure_ascii=False,
        )


if __name__ == "__main__":
    main()
