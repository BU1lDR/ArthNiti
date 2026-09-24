// Translations for the prose the Python services generate.
//
// This is the half of the app that used to stay English no matter which language
// was chosen: advisory recommendations, business observations, the risk reason,
// the summary sentences, scheme text, and where each market figure comes from.
// The services now emit a stable code beside every sentence they build
// (`recommendation_codes`, `observation_codes`, `reason_code`, `message_code`,
// `next_step_code`, `match_reason_codes`, the market `source_code` and
// `note_code`, and per-scheme `description_code` / `support_type_code` /
// `eligibility_codes` / `document_codes`), and this file is where those codes
// become readable text.
//
// Translating on this side rather than in Python is deliberate: the language
// switch has to redraw a result page instantly, and the analysis runs once, on
// the /finance submit. If the backend returned pre-translated prose, changing
// language on /report would need a second API call and a loading state.
//
// If a code has no entry here, the page prints the English sentence the backend
// already sent — never the dotted code. So a new rules branch degrades to
// readable English rather than leaking `adv.somethingNew` onto the screen. That
// is what `tBackend` in LanguageContext.jsx does.
//
// Register: these are read by someone who may be barely literate, so they use
// everyday words over financial vocabulary — "money left each month" rather than
// "net surplus", "loan payment" rather than "EMI". The English here is therefore
// plainer than the backend's own formal wording, which stays as the fallback.
//
// Punctuation follows the script, not English: Devanagari and Bengali sentences
// end in `।`, the Dravidian scripts use `.`. Digits and money amounts stay in
// Latin script, because that is what is printed on currency and on forms.
//
// NOT reviewed by a native speaker on the team. Wording was chosen for
// naturalness rather than word-for-word fidelity, which is the right trade for
// this audience but does mean a reviewer should read it before any real launch.

const en = {
  // Advisory recommendations.
  'adv.reduceExpenses': 'Cut spending that is not necessary, and check whether your prices are right.',
  'adv.growRevenue': 'Work on earning more while keeping your monthly spending the same.',
  'adv.maintainExpand': 'Keep going the way you are, and grow slowly and carefully.',
  'adv.improveMargin': 'Improve how much you keep out of every rupee before you grow bigger.',
  'adv.healthyMargin': 'You keep a good share of what you earn, so growing may suit you.',
  'adv.cashReserve': 'Keep enough cash saved before you put money into something new.',
  'adv.fundingGap': 'You do not yet have all the money you need to start. Look at the schemes page for loans or help for your kind of work, and do not borrow more than you can repay.',

  // Business observations.
  'obs.expensesExceedRevenue': 'Your expected spending is more than your expected earning.',
  'obs.breakEven': 'The business is expected to just about cover its costs.',
  'obs.positiveSurplus': 'The business is expected to have money left over every month.',
  'obs.lowMargin': 'Very little is left out of each rupee. Try to cut costs or earn more.',
  'obs.healthyMargin': 'A good share of what you earn stays with you.',
  'obs.existingDebt': 'Think about the loan you already have before taking another one.',

  // Risk reason.
  'rsn.noSurplus': 'No money is left each month to make a loan payment from.',
  'rsn.emiBelow30': 'The loan payment takes less than 30% of the money you have left each month.',
  'rsn.emi30to50': 'The loan payment takes 30% to 50% of the money you have left each month.',
  'rsn.emiAbove50': 'The loan payment takes more than half of the money you have left each month.',
  'rsn.gapBelow30': 'Counting a loan for the money you still need, loan payments would take less than 30% of the money you have left each month.',
  'rsn.gap30to50': 'Counting a loan for the money you still need, loan payments would take 30% to 50% of the money you have left each month.',
  'rsn.gapAbove50': 'Counting a loan for the money you still need, loan payments would take more than half of the money you have left each month.',

  // Overall summary message.
  'sum.positive': 'Your business is in a good position.',
  'sum.needsAttention': 'Your business needs attention before you take on more money risk.',
  'sum.needsFunding': 'Your figures work, but you do not yet have all the money you need to start.',
  'sum.reviewCarefully': 'Look at your business money carefully before your next decision.',

  // Priority next step.
  'nxt.reducePressure': 'Bring down your loan pressure before taking another loan.',
  'nxt.reviewExpenses': 'Check your spending and find ways to earn more each month.',
  'nxt.reviewPlan': 'Look again at your business plan before putting in more money.',
  'nxt.gapTooLarge': 'A loan for the money you still need would be too big for what you have left each month. Start smaller, or find more of the money yourself first.',
  'nxt.arrangeGap': 'Before you start, work out how you will get the money you still need, and keep any loan small enough to repay.',
  'nxt.maintainDiscipline': 'Keep handling money the way you are, and keep watching your spending.',

  // Why a scheme matched.
  'why.categorySupported': 'This scheme supports your kind of work ({categories}).',
  'why.stateAvailable': 'This scheme is for every state, including yours.',
  'why.stateSpecific': 'This scheme is only for your state.',
  'why.regionSpecific': 'This scheme is only for some states, and yours is one of them.',

  // The wording schemes use for a kind of work. Kept plain, because it is read
  // inside the sentence above.

  // Scheme prose.

  // Scheme eligibility. Amounts stay exactly as the rules state them.

  // Documents. Shared across schemes, since the same papers repeat.

  // Where a market figure comes from: the source_code on every market row. The
  // English here must match the row's own source field word for word;
  // tools/verify/market-lib-test.mjs and backend/tests/test_market_data_guards.py
  // both compare them.
  'src.agmarknetMandi': 'Daily mandi prices reported to Agmarknet, published on data.gov.in',
  'src.udyamList': 'Udyam registrations, published on data.gov.in',
  'src.udyamAggregate': 'The Ministry of MSME\'s district counts of Udyam registrations, published on data.gov.in',

  // A note a count row can carry (its note_code), saying how the figure was put
  // together. The English must match the row's own note field, and
  // market-lib-test.mjs compares them.
  'mknote.ourGrouping': 'We chose which kinds of registered work to count in this figure.',
  'mknote.ministryServices': 'This is the Ministry\'s own count of registered service businesses. It may include shops and traders.',
  'mknote.ministryManufacturing': 'This is the Ministry\'s own count of registered manufacturing businesses. It counts each business once, by its main kind of work.',
  'mknote.dairyProducts': 'This counts registered businesses that make dairy products, such as ghee, paneer or packaged milk. Keeping cows or buffaloes is not counted in it.',

  // Crop names for a mandi price row, looked up from the row's commodity_id
  // through COMMODITY_KEYS in backendText.js. The English must match the en name
  // in tools/market-commodities.json, and market-lib-test.mjs compares them.
  'cmd.wheat': 'Wheat',
  'cmd.paddyCommon': 'Paddy',
  'cmd.potato': 'Potato',
  'cmd.onion': 'Onion',
  'cmd.tomato': 'Tomato',
  'cmd.gingerGreen': 'Green ginger',
  'cmd.greenChilli': 'Green chilli',
  'cmd.garlic': 'Garlic',
  'cmd.mustard': 'Mustard seed',
  'cmd.corianderLeaves': 'Coriander leaves',
}

const hi = {
  'adv.reduceExpenses': 'गैर-ज़रूरी खर्च कम करें, और देखें कि आपके दाम ठीक हैं या नहीं।',
  'adv.growRevenue': 'महीने का खर्च उतना ही रखते हुए कमाई बढ़ाने पर ध्यान दें।',
  'adv.maintainExpand': 'जैसे चल रहे हैं वैसे ही चलते रहें, और धीरे-धीरे सोच-समझकर बढ़ें।',
  'adv.improveMargin': 'बड़ा करने से पहले यह बढ़ाएँ कि हर रुपये में से आपके पास कितना बचता है।',
  'adv.healthyMargin': 'आपकी कमाई का अच्छा हिस्सा आपके पास बचता है, इसलिए काम बढ़ाना आपके लिए ठीक हो सकता है।',
  'adv.cashReserve': 'किसी नई चीज़ में पैसा लगाने से पहले हाथ में पूरा पैसा जमा रखें।',
  'adv.fundingGap': 'काम शुरू करने के लिए जितना पैसा चाहिए, उतना अभी आपके पास नहीं है। अपने काम के लिए कर्ज़ या मदद के लिए योजनाओं वाला पेज देखें, और जितना चुका सकें उससे ज़्यादा कर्ज़ न लें।',

  'obs.expensesExceedRevenue': 'आपका अनुमानित खर्च आपकी अनुमानित कमाई से ज़्यादा है।',
  'obs.breakEven': 'कारोबार से लगभग सिर्फ़ लागत निकलने का अनुमान है।',
  'obs.positiveSurplus': 'कारोबार में हर महीने पैसा बचने का अनुमान है।',
  'obs.lowMargin': 'हर रुपये में से बहुत कम बचता है। खर्च कम करने या कमाई बढ़ाने की कोशिश करें।',
  'obs.healthyMargin': 'आपकी कमाई का अच्छा हिस्सा आपके पास रहता है।',
  'obs.existingDebt': 'नया कर्ज़ लेने से पहले जो कर्ज़ पहले से है उसका ध्यान रखें।',

  'rsn.noSurplus': 'हर महीने कोई पैसा नहीं बचता जिससे कर्ज़ की किस्त दी जा सके।',
  'rsn.emiBelow30': 'महीने में बचने वाले पैसे का 30% से कम किस्त में जाता है।',
  'rsn.emi30to50': 'महीने में बचने वाले पैसे का 30% से 50% किस्त में जाता है।',
  'rsn.emiAbove50': 'महीने में बचने वाले पैसे का आधे से ज़्यादा किस्त में चला जाता है।',
  'rsn.gapBelow30': 'जो पैसा अभी और चाहिए उसका कर्ज़ भी गिनें, तो महीने में बचने वाले पैसे का 30% से कम किस्तों में जाएगा।',
  'rsn.gap30to50': 'जो पैसा अभी और चाहिए उसका कर्ज़ भी गिनें, तो महीने में बचने वाले पैसे का 30% से 50% किस्तों में जाएगा।',
  'rsn.gapAbove50': 'जो पैसा अभी और चाहिए उसका कर्ज़ भी गिनें, तो महीने में बचने वाले पैसे का आधे से ज़्यादा किस्तों में चला जाएगा।',

  'sum.positive': 'आपका कारोबार अच्छी हालत में है।',
  'sum.needsAttention': 'पैसे का और जोखिम लेने से पहले आपके कारोबार पर ध्यान देना ज़रूरी है।',
  'sum.needsFunding': 'आपका हिसाब ठीक बैठता है, पर काम शुरू करने के लिए जितना पैसा चाहिए उतना अभी आपके पास नहीं है।',
  'sum.reviewCarefully': 'अगला फ़ैसला करने से पहले कारोबार के पैसे को ध्यान से देखें।',

  'nxt.reducePressure': 'दूसरा कर्ज़ लेने से पहले किस्त का बोझ कम करें।',
  'nxt.reviewExpenses': 'अपना खर्च देखें और हर महीने ज़्यादा कमाने के रास्ते खोजें।',
  'nxt.reviewPlan': 'और पैसा लगाने से पहले अपनी कारोबार की योजना दोबारा देखें।',
  'nxt.gapTooLarge': 'जो पैसा अभी और चाहिए उसके लिए कर्ज़ लें, तो उसकी किस्त महीने में बचने वाले पैसे के हिसाब से बहुत भारी होगी। छोटे से शुरू करें, या पहले ख़ुद और पैसा जुटाएँ।',
  'nxt.arrangeGap': 'शुरू करने से पहले तय करें कि जो पैसा अभी और चाहिए वह कहाँ से आएगा, और कर्ज़ उतना ही लें जितना चुका सकें।',
  'nxt.maintainDiscipline': 'पैसे को जैसे सँभाल रहे हैं वैसे ही सँभालते रहें, और खर्च पर नज़र रखें।',

  'why.categorySupported': 'यह योजना आपके जैसे काम को मदद देती है ({categories})।',
  'why.stateAvailable': 'यह योजना हर राज्य के लिए है, आपके राज्य के लिए भी।',
  'why.stateSpecific': 'यह योजना केवल आपके राज्य के लिए है।',
  'why.regionSpecific': 'यह योजना कुछ ही राज्यों के लिए है, और आपका राज्य उनमें से एक है।',





  'src.agmarknetMandi': 'एगमार्कनेट को भेजे गए मंडी के रोज़ के दाम, data.gov.in पर प्रकाशित',
  'src.udyamList': 'उद्यम पंजीकरण, data.gov.in पर प्रकाशित',
  'src.udyamAggregate': 'एमएसएमई मंत्रालय की ज़िलेवार उद्यम पंजीकरण की गिनती, data.gov.in पर प्रकाशित',

  'mknote.ourGrouping': 'इस आंकड़े में दर्ज कामों में से किन-किन तरह के कामों को गिनना है, यह हमने तय किया है।',
  'mknote.ministryServices': 'यह दर्ज सेवा कारोबारों की मंत्रालय की अपनी गिनती है। इसमें दुकानें और व्यापारी भी शामिल हो सकते हैं।',
  'mknote.ministryManufacturing': 'यह सामान बनाने वाले दर्ज कारोबारों की मंत्रालय की अपनी गिनती है। इसमें हर कारोबार को उसके मुख्य काम के हिसाब से एक ही बार गिना गया है।',
  'mknote.dairyProducts': 'इसमें वे दर्ज कारोबार गिने गए हैं जो दूध से बनी चीज़ें बनाते हैं, जैसे घी, पनीर या पैकेट वाला दूध। गाय-भैंस पालने का काम इसमें नहीं गिना गया है।',

  'cmd.wheat': 'गेहूँ',
  'cmd.paddyCommon': 'धान',
  'cmd.potato': 'आलू',
  'cmd.onion': 'प्याज़',
  'cmd.tomato': 'टमाटर',
  'cmd.gingerGreen': 'हरी अदरक',
  'cmd.greenChilli': 'हरी मिर्च',
  'cmd.garlic': 'लहसुन',
  'cmd.mustard': 'सरसों',
  'cmd.corianderLeaves': 'हरा धनिया',
}

const ta = {
  'adv.reduceExpenses': 'தேவையில்லாத செலவுகளைக் குறையுங்கள், உங்கள் விலை சரியாக இருக்கிறதா என்று பாருங்கள்.',
  'adv.growRevenue': 'மாதச் செலவை அதே அளவில் வைத்துக்கொண்டு வருமானத்தை அதிகரிக்க முயற்சி செய்யுங்கள்.',
  'adv.maintainExpand': 'இப்போது போவது போலவே தொடருங்கள், மெதுவாகக் கவனமாக வளருங்கள்.',
  'adv.improveMargin': 'பெரிதாக்குவதற்கு முன், ஒவ்வொரு ரூபாயிலும் உங்களிடம் எவ்வளவு மிச்சமாகிறது என்பதை அதிகரியுங்கள்.',
  'adv.healthyMargin': 'சம்பாதிப்பதில் நல்ல பங்கு உங்களிடம் மிச்சமாகிறது, எனவே தொழிலை வளர்ப்பது உங்களுக்குப் பொருந்தலாம்.',
  'adv.cashReserve': 'புதிதாக ஒன்றில் பணம் போடுவதற்கு முன், கையில் போதுமான பணத்தைச் சேமித்து வையுங்கள்.',
  'adv.fundingGap': 'தொழில் தொடங்கத் தேவையான பணம் முழுவதும் இன்னும் உங்களிடம் இல்லை. உங்கள் வேலைக்கான கடன் அல்லது உதவிக்கு, திட்டங்கள் பக்கத்தைப் பாருங்கள். திருப்பிக் கட்ட முடிவதை விட அதிகமாகக் கடன் வாங்காதீர்கள்.',

  'obs.expensesExceedRevenue': 'நீங்கள் எதிர்பார்க்கும் செலவு, எதிர்பார்க்கும் வருமானத்தை விட அதிகம்.',
  'obs.breakEven': 'தொழிலில் செலவு மட்டும் திரும்பக் கிடைக்கும் என்று தெரிகிறது.',
  'obs.positiveSurplus': 'ஒவ்வொரு மாதமும் தொழிலில் பணம் மிச்சமாகும் என்று தெரிகிறது.',
  'obs.lowMargin': 'ஒவ்வொரு ரூபாயிலும் மிகக் குறைவாகவே மிச்சமாகிறது. செலவைக் குறைக்கவோ வருமானத்தை அதிகரிக்கவோ முயலுங்கள்.',
  'obs.healthyMargin': 'நீங்கள் சம்பாதிப்பதில் நல்ல பங்கு உங்களிடமே இருக்கிறது.',
  'obs.existingDebt': 'இன்னொரு கடன் வாங்குவதற்கு முன், ஏற்கனவே இருக்கும் கடனை நினைவில் வையுங்கள்.',

  'rsn.noSurplus': 'கடன் தவணை கட்டுவதற்கு மாதம் எந்தப் பணமும் மிச்சமாகவில்லை.',
  'rsn.emiBelow30': 'மாதம் மிச்சமாகும் பணத்தில் 30%-க்கும் குறைவாகவே தவணைக்குப் போகிறது.',
  'rsn.emi30to50': 'மாதம் மிச்சமாகும் பணத்தில் 30% முதல் 50% வரை தவணைக்குப் போகிறது.',
  'rsn.emiAbove50': 'மாதம் மிச்சமாகும் பணத்தில் பாதிக்கு மேல் தவணைக்கே போய்விடுகிறது.',
  'rsn.gapBelow30': 'இன்னும் தேவையான பணத்துக்கான கடனையும் சேர்த்தால், மாதம் மிச்சமாகும் பணத்தில் 30%-க்கும் குறைவாகவே தவணைகளுக்குப் போகும்.',
  'rsn.gap30to50': 'இன்னும் தேவையான பணத்துக்கான கடனையும் சேர்த்தால், மாதம் மிச்சமாகும் பணத்தில் 30% முதல் 50% வரை தவணைகளுக்குப் போகும்.',
  'rsn.gapAbove50': 'இன்னும் தேவையான பணத்துக்கான கடனையும் சேர்த்தால், மாதம் மிச்சமாகும் பணத்தில் பாதிக்கு மேல் தவணைகளுக்கே போய்விடும்.',

  'sum.positive': 'உங்கள் தொழில் நல்ல நிலையில் இருக்கிறது.',
  'sum.needsAttention': 'பணம் சம்பந்தமாக மேலும் ஆபத்து எடுப்பதற்கு முன், உங்கள் தொழிலில் கவனம் தேவை.',
  'sum.needsFunding': 'உங்கள் கணக்கு சரியாக வருகிறது, ஆனால் தொழில் தொடங்கத் தேவையான பணம் முழுவதும் இன்னும் உங்களிடம் இல்லை.',
  'sum.reviewCarefully': 'அடுத்த முடிவு எடுப்பதற்கு முன், தொழிலின் பணநிலையைக் கவனமாகப் பாருங்கள்.',

  'nxt.reducePressure': 'இன்னொரு கடன் வாங்குவதற்கு முன், தவணைச் சுமையைக் குறையுங்கள்.',
  'nxt.reviewExpenses': 'உங்கள் செலவைப் பாருங்கள், மாதம் அதிகமாகச் சம்பாதிக்க வழி தேடுங்கள்.',
  'nxt.reviewPlan': 'இன்னும் பணம் போடுவதற்கு முன், உங்கள் தொழில் திட்டத்தை மீண்டும் பாருங்கள்.',
  'nxt.gapTooLarge': 'இன்னும் தேவையான பணத்துக்கு வாங்க வேண்டிய கடன், மாதம் மிச்சமாகும் பணத்துக்கு மிகப் பெரியது. சிறிதாகத் தொடங்குங்கள், அல்லது முதலில் இன்னும் கொஞ்சம் பணத்தை நீங்களே திரட்டுங்கள்.',
  'nxt.arrangeGap': 'தொடங்குவதற்கு முன், இன்னும் தேவையான பணம் எங்கிருந்து வரும் என்று முடிவு செய்யுங்கள். கடன் வாங்கினால், திருப்பிக் கட்ட முடியும் அளவுக்கு மட்டும் வாங்குங்கள்.',
  'nxt.maintainDiscipline': 'பணத்தை இப்போது கையாளுவது போலவே தொடருங்கள், செலவைக் கவனித்து வாருங்கள்.',

  'why.categorySupported': 'உங்கள் வகையான வேலைக்கு இந்தத் திட்டம் உதவுகிறது ({categories}).',
  'why.stateAvailable': 'இந்தத் திட்டம் உங்கள் மாநிலம் உட்பட எல்லா மாநிலங்களிலும் கிடைக்கிறது.',
  'why.stateSpecific': 'இந்தத் திட்டம் உங்கள் மாநிலத்துக்கு மட்டுமே.',
  'why.regionSpecific': 'இந்தத் திட்டம் சில மாநிலங்களுக்கு மட்டுமே; உங்கள் மாநிலம் அவற்றில் ஒன்று.',





  'src.agmarknetMandi': 'அக்மார்க்நெட்டுக்குத் தெரிவிக்கப்பட்ட மண்டியின் தினசரி விலைகள், data.gov.in-இல் வெளியிடப்பட்டவை',
  'src.udyamList': 'உத்யம் பதிவுகள், data.gov.in-இல் வெளியிடப்பட்டவை',
  'src.udyamAggregate': 'எம்எஸ்எம்இ அமைச்சகத்தின் மாவட்ட வாரியான உத்யம் பதிவு எண்ணிக்கை, data.gov.in-இல் வெளியிடப்பட்டது',

  'mknote.ourGrouping': 'பதிவு செய்யப்பட்ட எந்த வகை வேலைகளை இந்த எண்ணில் சேர்ப்பது என்று நாங்களே தேர்ந்தெடுத்தோம்.',
  'mknote.ministryServices': 'இது பதிவு செய்த சேவைத் தொழில்களுக்கான அமைச்சகத்தின் சொந்த எண்ணிக்கை. இதில் கடைகளும் வியாபாரிகளும் சேர்ந்திருக்கலாம்.',
  'mknote.ministryManufacturing': 'இது பதிவு செய்த உற்பத்தித் தொழில்களுக்கான அமைச்சகத்தின் சொந்த எண்ணிக்கை. இதில் ஒவ்வொரு தொழிலும் அதன் முக்கிய வேலையின் அடிப்படையில் ஒரு முறை மட்டுமே எண்ணப்படுகிறது.',
  'mknote.dairyProducts': 'இதில் நெய், பனீர், பாக்கெட் பால் போன்ற பால் பொருட்களைத் தயாரிக்கும் பதிவு செய்த தொழில்கள் எண்ணப்படுகின்றன. பசு, எருமை வளர்க்கும் வேலை இதில் எண்ணப்படவில்லை.',

  'cmd.wheat': 'கோதுமை',
  'cmd.paddyCommon': 'நெல்',
  'cmd.potato': 'உருளைக்கிழங்கு',
  'cmd.onion': 'வெங்காயம்',
  'cmd.tomato': 'தக்காளி',
  'cmd.gingerGreen': 'பச்சை இஞ்சி',
  'cmd.greenChilli': 'பச்சை மிளகாய்',
  'cmd.garlic': 'பூண்டு',
  'cmd.mustard': 'கடுகு',
  'cmd.corianderLeaves': 'கொத்தமல்லி இலை',
}

const te = {
  'adv.reduceExpenses': 'అవసరం లేని ఖర్చులను తగ్గించండి, మీ ధరలు సరిగ్గా ఉన్నాయా అని చూడండి.',
  'adv.growRevenue': 'నెల ఖర్చును అలాగే ఉంచుకుని ఆదాయం పెంచడంపై దృష్టి పెట్టండి.',
  'adv.maintainExpand': 'ఇప్పుడు నడుస్తున్నట్టే కొనసాగించండి, నెమ్మదిగా ఆలోచించి పెంచుకోండి.',
  'adv.improveMargin': 'పెద్దది చేసే ముందు, ప్రతి రూపాయిలో మీ దగ్గర ఎంత మిగులుతుందో పెంచుకోండి.',
  'adv.healthyMargin': 'మీ ఆదాయంలో మంచి భాగం మీ దగ్గరే మిగులుతుంది, కాబట్టి వ్యాపారం పెంచడం మీకు సరిపోవచ్చు.',
  'adv.cashReserve': 'కొత్తగా ఏదైనా పెట్టుబడి పెట్టే ముందు, చేతిలో సరిపడా డబ్బు దాచుకోండి.',
  'adv.fundingGap': 'వ్యాపారం మొదలుపెట్టడానికి కావలసిన డబ్బు మొత్తం ఇంకా మీ దగ్గర లేదు. మీ పనికి అప్పు లేదా సాయం కోసం పథకాల పేజీ చూడండి. తిరిగి కట్టగలిగిన దానికంటే ఎక్కువ అప్పు తీసుకోకండి.',

  'obs.expensesExceedRevenue': 'మీరు అనుకున్న ఖర్చు, మీరు అనుకున్న ఆదాయం కంటే ఎక్కువ.',
  'obs.breakEven': 'వ్యాపారంలో ఖర్చు మాత్రమే తిరిగి వస్తుందని కనిపిస్తోంది.',
  'obs.positiveSurplus': 'ప్రతి నెల వ్యాపారంలో డబ్బు మిగులుతుందని కనిపిస్తోంది.',
  'obs.lowMargin': 'ప్రతి రూపాయిలో చాలా తక్కువే మిగులుతుంది. ఖర్చు తగ్గించడానికి లేదా ఆదాయం పెంచడానికి ప్రయత్నించండి.',
  'obs.healthyMargin': 'మీరు సంపాదించినదిలో మంచి భాగం మీ దగ్గరే ఉంటుంది.',
  'obs.existingDebt': 'ఇంకో అప్పు తీసుకునే ముందు, ఇప్పటికే ఉన్న అప్పును గుర్తుంచుకోండి.',

  'rsn.noSurplus': 'అప్పు వాయిదా కట్టడానికి నెలలో ఏ డబ్బూ మిగలడం లేదు.',
  'rsn.emiBelow30': 'నెలలో మిగిలే డబ్బులో 30% కంటే తక్కువే వాయిదాకు పోతుంది.',
  'rsn.emi30to50': 'నెలలో మిగిలే డబ్బులో 30% నుంచి 50% వాయిదాకు పోతుంది.',
  'rsn.emiAbove50': 'నెలలో మిగిలే డబ్బులో సగం కంటే ఎక్కువ వాయిదాకే పోతుంది.',
  'rsn.gapBelow30': 'ఇంకా కావలసిన డబ్బు కోసం అప్పును కూడా లెక్కలోకి తీసుకుంటే, నెలలో మిగిలే డబ్బులో 30% కంటే తక్కువే వాయిదాలకు పోతుంది.',
  'rsn.gap30to50': 'ఇంకా కావలసిన డబ్బు కోసం అప్పును కూడా లెక్కలోకి తీసుకుంటే, నెలలో మిగిలే డబ్బులో 30% నుంచి 50% వాయిదాలకు పోతుంది.',
  'rsn.gapAbove50': 'ఇంకా కావలసిన డబ్బు కోసం అప్పును కూడా లెక్కలోకి తీసుకుంటే, నెలలో మిగిలే డబ్బులో సగం కంటే ఎక్కువ వాయిదాలకే పోతుంది.',

  'sum.positive': 'మీ వ్యాపారం మంచి స్థితిలో ఉంది.',
  'sum.needsAttention': 'డబ్బు విషయంలో ఇంకా రిస్క్ తీసుకునే ముందు మీ వ్యాపారంపై శ్రద్ధ పెట్టాలి.',
  'sum.needsFunding': 'మీ లెక్కలు సరిపోతున్నాయి, కానీ వ్యాపారం మొదలుపెట్టడానికి కావలసిన డబ్బు మొత్తం ఇంకా మీ దగ్గర లేదు.',
  'sum.reviewCarefully': 'తరువాత నిర్ణయం తీసుకునే ముందు వ్యాపారం డబ్బును జాగ్రత్తగా చూడండి.',

  'nxt.reducePressure': 'ఇంకో అప్పు తీసుకునే ముందు వాయిదా భారాన్ని తగ్గించుకోండి.',
  'nxt.reviewExpenses': 'మీ ఖర్చును చూడండి, నెలకు ఎక్కువ సంపాదించే మార్గాలు వెతకండి.',
  'nxt.reviewPlan': 'ఇంకా డబ్బు పెట్టే ముందు మీ వ్యాపార ప్రణాళికను మళ్ళీ చూడండి.',
  'nxt.gapTooLarge': 'ఇంకా కావలసిన డబ్బు కోసం తీసుకోవాల్సిన అప్పు, నెలలో మిగిలే డబ్బుతో పోలిస్తే చాలా పెద్దది. చిన్నగా మొదలుపెట్టండి, లేదా ముందు ఇంకొంత డబ్బు మీరే సమకూర్చుకోండి.',
  'nxt.arrangeGap': 'మొదలుపెట్టే ముందు, ఇంకా కావలసిన డబ్బు ఎక్కడి నుంచి వస్తుందో నిర్ణయించుకోండి. అప్పు తీసుకుంటే, తిరిగి కట్టగలిగినంత మాత్రమే తీసుకోండి.',
  'nxt.maintainDiscipline': 'డబ్బును ఇప్పుడు నిర్వహిస్తున్నట్టే కొనసాగించండి, ఖర్చుపై కన్ను ఉంచండి.',

  'why.categorySupported': 'మీ లాంటి పనికి ఈ పథకం సహాయం చేస్తుంది ({categories}).',
  'why.stateAvailable': 'ఈ పథకం మీ రాష్ట్రంతో సహా అన్ని రాష్ట్రాల్లో అందుబాటులో ఉంది.',
  'why.stateSpecific': 'ఈ పథకం మీ రాష్ట్రానికి మాత్రమే.',
  'why.regionSpecific': 'ఈ పథకం కొన్ని రాష్ట్రాలకు మాత్రమే, మీ రాష్ట్రం వాటిలో ఒకటి.',





  'src.agmarknetMandi': 'అగ్‌మార్క్‌నెట్‌కు తెలిపిన మండీ రోజువారీ ధరలు, data.gov.in-లో ప్రచురించినవి',
  'src.udyamList': 'ఉద్యమ్ నమోదులు, data.gov.in-లో ప్రచురించినవి',
  'src.udyamAggregate': 'ఎంఎస్ఎంఈ మంత్రిత్వ శాఖ జిల్లాల వారీ ఉద్యమ్ నమోదుల లెక్క, data.gov.in-లో ప్రచురించినది',

  'mknote.ourGrouping': 'నమోదైన ఏ రకాల పనులను ఈ అంకెలో లెక్కించాలో మేమే ఎంచుకున్నాం.',
  'mknote.ministryServices': 'ఇది నమోదైన సేవా వ్యాపారాలకు మంత్రిత్వ శాఖ స్వంత లెక్క. ఇందులో దుకాణాలు, వ్యాపారులు కూడా ఉండవచ్చు.',
  'mknote.ministryManufacturing': 'ఇది నమోదైన తయారీ వ్యాపారాలకు మంత్రిత్వ శాఖ స్వంత లెక్క. ఇందులో ప్రతి వ్యాపారాన్ని దాని ముఖ్యమైన పనిని బట్టి ఒక్కసారి మాత్రమే లెక్కిస్తారు.',
  'mknote.dairyProducts': 'ఇందులో నెయ్యి, పనీర్, ప్యాకెట్ పాలు వంటి పాల ఉత్పత్తులను తయారుచేసే నమోదైన వ్యాపారాలను లెక్కించారు. ఆవులు, గేదెల పెంపకాన్ని ఇందులో లెక్కించలేదు.',

  'cmd.wheat': 'గోధుమ',
  'cmd.paddyCommon': 'వరి',
  'cmd.potato': 'బంగాళాదుంప',
  'cmd.onion': 'ఉల్లిపాయ',
  'cmd.tomato': 'టమాటా',
  'cmd.gingerGreen': 'పచ్చి అల్లం',
  'cmd.greenChilli': 'పచ్చి మిరపకాయ',
  'cmd.garlic': 'వెల్లుల్లి',
  'cmd.mustard': 'ఆవాలు',
  'cmd.corianderLeaves': 'కొత్తిమీర',
}

const ml = {
  'adv.reduceExpenses': 'ആവശ്യമില്ലാത്ത ചെലവുകൾ കുറയ്ക്കുക, നിങ്ങളുടെ വില ശരിയാണോ എന്ന് നോക്കുക.',
  'adv.growRevenue': 'മാസച്ചെലവ് അതേപടി നിലനിർത്തി വരുമാനം കൂട്ടാൻ ശ്രമിക്കുക.',
  'adv.maintainExpand': 'ഇപ്പോൾ പോകുന്നതുപോലെ തുടരുക, പതുക്കെ ശ്രദ്ധിച്ച് വളരുക.',
  'adv.improveMargin': 'വലുതാക്കുന്നതിന് മുൻപ്, ഓരോ രൂപയിൽ നിന്ന് നിങ്ങളുടെ കൈയിൽ എത്ര ബാക്കിയാകുന്നു എന്നത് കൂട്ടുക.',
  'adv.healthyMargin': 'നിങ്ങൾ സമ്പാദിക്കുന്നതിന്റെ നല്ലൊരു ഭാഗം കൈയിൽ ബാക്കിയാകുന്നു, അതുകൊണ്ട് ബിസിനസ് വളർത്തുന്നത് നിങ്ങൾക്ക് യോജിക്കും.',
  'adv.cashReserve': 'പുതിയതായി എന്തിലെങ്കിലും പണം ഇടുന്നതിന് മുൻപ്, കൈയിൽ വേണ്ടത്ര പണം കരുതിവയ്ക്കുക.',
  'adv.fundingGap': 'ബിസിനസ് തുടങ്ങാൻ വേണ്ട പണം മുഴുവൻ ഇപ്പോഴും നിങ്ങളുടെ കൈയിലില്ല. നിങ്ങളുടെ ജോലിക്കുള്ള വായ്പയ്ക്കോ സഹായത്തിനോ പദ്ധതികളുടെ പേജ് നോക്കുക. തിരിച്ചടയ്ക്കാൻ കഴിയുന്നതിലും കൂടുതൽ വായ്പ എടുക്കരുത്.',

  'obs.expensesExceedRevenue': 'നിങ്ങൾ പ്രതീക്ഷിക്കുന്ന ചെലവ്, പ്രതീക്ഷിക്കുന്ന വരുമാനത്തെക്കാൾ കൂടുതലാണ്.',
  'obs.breakEven': 'ബിസിനസിൽ ചെലവ് മാത്രം തിരികെ കിട്ടും എന്നാണ് കാണുന്നത്.',
  'obs.positiveSurplus': 'എല്ലാ മാസവും ബിസിനസിൽ പണം ബാക്കിയാകും എന്നാണ് കാണുന്നത്.',
  'obs.lowMargin': 'ഓരോ രൂപയിൽ നിന്ന് വളരെ കുറച്ചേ ബാക്കിയാകുന്നു. ചെലവ് കുറയ്ക്കാനോ വരുമാനം കൂട്ടാനോ ശ്രമിക്കുക.',
  'obs.healthyMargin': 'നിങ്ങൾ സമ്പാദിക്കുന്നതിന്റെ നല്ലൊരു ഭാഗം നിങ്ങളുടെ കൈയിൽത്തന്നെ നിൽക്കുന്നു.',
  'obs.existingDebt': 'വേറൊരു വായ്പ എടുക്കുന്നതിന് മുൻപ്, ഇപ്പോൾ ഉള്ള വായ്പ ഓർക്കുക.',

  'rsn.noSurplus': 'വായ്പയുടെ തവണ അടയ്ക്കാൻ മാസം ഒരു പണവും ബാക്കിയാകുന്നില്ല.',
  'rsn.emiBelow30': 'മാസം ബാക്കിയാകുന്ന പണത്തിന്റെ 30%-ൽ താഴെയേ തവണയ്ക്ക് പോകുന്നു.',
  'rsn.emi30to50': 'മാസം ബാക്കിയാകുന്ന പണത്തിന്റെ 30% മുതൽ 50% വരെ തവണയ്ക്ക് പോകുന്നു.',
  'rsn.emiAbove50': 'മാസം ബാക്കിയാകുന്ന പണത്തിന്റെ പകുതിയിലധികവും തവണയ്ക്കുതന്നെ പോകുന്നു.',
  'rsn.gapBelow30': 'ഇനിയും വേണ്ട പണത്തിനുള്ള വായ്പ കൂടി കണക്കാക്കിയാൽ, മാസം ബാക്കിയാകുന്ന പണത്തിന്റെ 30%-ൽ താഴെയേ തവണകൾക്ക് പോകൂ.',
  'rsn.gap30to50': 'ഇനിയും വേണ്ട പണത്തിനുള്ള വായ്പ കൂടി കണക്കാക്കിയാൽ, മാസം ബാക്കിയാകുന്ന പണത്തിന്റെ 30% മുതൽ 50% വരെ തവണകൾക്ക് പോകും.',
  'rsn.gapAbove50': 'ഇനിയും വേണ്ട പണത്തിനുള്ള വായ്പ കൂടി കണക്കാക്കിയാൽ, മാസം ബാക്കിയാകുന്ന പണത്തിന്റെ പകുതിയിലധികവും തവണകൾക്കുതന്നെ പോകും.',

  'sum.positive': 'നിങ്ങളുടെ ബിസിനസ് നല്ല നിലയിലാണ്.',
  'sum.needsAttention': 'പണത്തിന്റെ കാര്യത്തിൽ കൂടുതൽ റിസ്ക് എടുക്കുന്നതിന് മുൻപ് നിങ്ങളുടെ ബിസിനസിൽ ശ്രദ്ധ വേണം.',
  'sum.needsFunding': 'നിങ്ങളുടെ കണക്കുകൾ ശരിയാകുന്നുണ്ട്, പക്ഷേ ബിസിനസ് തുടങ്ങാൻ വേണ്ട പണം മുഴുവൻ ഇപ്പോഴും നിങ്ങളുടെ കൈയിലില്ല.',
  'sum.reviewCarefully': 'അടുത്ത തീരുമാനം എടുക്കുന്നതിന് മുൻപ് ബിസിനസിന്റെ പണക്കാര്യം ശ്രദ്ധിച്ച് നോക്കുക.',

  'nxt.reducePressure': 'വേറൊരു വായ്പ എടുക്കുന്നതിന് മുൻപ് തവണയുടെ ഭാരം കുറയ്ക്കുക.',
  'nxt.reviewExpenses': 'നിങ്ങളുടെ ചെലവ് നോക്കുക, മാസം കൂടുതൽ സമ്പാദിക്കാൻ വഴി കണ്ടെത്തുക.',
  'nxt.reviewPlan': 'കൂടുതൽ പണം ഇടുന്നതിന് മുൻപ് നിങ്ങളുടെ ബിസിനസ് പദ്ധതി വീണ്ടും നോക്കുക.',
  'nxt.gapTooLarge': 'ഇനിയും വേണ്ട പണത്തിന് എടുക്കേണ്ട വായ്പ, മാസം ബാക്കിയാകുന്ന പണം വച്ചുനോക്കുമ്പോൾ വളരെ വലുതാണ്. ചെറുതായി തുടങ്ങുക, അല്ലെങ്കിൽ ആദ്യം കുറച്ചുകൂടി പണം സ്വയം കണ്ടെത്തുക.',
  'nxt.arrangeGap': 'തുടങ്ങുന്നതിന് മുൻപ്, ഇനിയും വേണ്ട പണം എവിടെനിന്ന് കിട്ടുമെന്ന് തീരുമാനിക്കുക. വായ്പ എടുക്കുകയാണെങ്കിൽ, തിരിച്ചടയ്ക്കാൻ കഴിയുന്നത്ര മാത്രം എടുക്കുക.',
  'nxt.maintainDiscipline': 'പണം ഇപ്പോൾ കൈകാര്യം ചെയ്യുന്നതുപോലെ തുടരുക, ചെലവിൽ കണ്ണ് വയ്ക്കുക.',

  'why.categorySupported': 'നിങ്ങളുടേതുപോലുള്ള ജോലിക്ക് ഈ പദ്ധതി സഹായം നൽകുന്നു ({categories}).',
  'why.stateAvailable': 'ഈ പദ്ധതി നിങ്ങളുടേത് ഉൾപ്പെടെ എല്ലാ സംസ്ഥാനങ്ങളിലും ലഭ്യമാണ്.',
  'why.stateSpecific': 'ഈ പദ്ധതി നിങ്ങളുടെ സംസ്ഥാനത്തിന് മാത്രമാണ്.',
  'why.regionSpecific': 'ഈ പദ്ധതി ചില സംസ്ഥാനങ്ങൾക്ക് മാത്രമാണ്, നിങ്ങളുടെ സംസ്ഥാനം അവയിലൊന്നാണ്.',





  'src.agmarknetMandi': 'അഗ്മാർക്ക്നെറ്റിലേക്ക് അറിയിച്ച മണ്ടിയിലെ ദിവസേനയുള്ള വിലകൾ, data.gov.in-ൽ പ്രസിദ്ധീകരിച്ചത്',
  'src.udyamList': 'ഉദ്യം രജിസ്ട്രേഷനുകൾ, data.gov.in-ൽ പ്രസിദ്ധീകരിച്ചത്',
  'src.udyamAggregate': 'എംഎസ്എംഇ മന്ത്രാലയത്തിന്റെ ജില്ല തിരിച്ചുള്ള ഉദ്യം രജിസ്ട്രേഷൻ എണ്ണം, data.gov.in-ൽ പ്രസിദ്ധീകരിച്ചത്',

  'mknote.ourGrouping': 'രജിസ്റ്റർ ചെയ്ത ഏതൊക്കെ തരം ജോലികൾ ഈ കണക്കിൽ എണ്ണണം എന്ന് ഞങ്ങളാണ് തീരുമാനിച്ചത്.',
  'mknote.ministryServices': 'ഇത് രജിസ്റ്റർ ചെയ്ത സേവന സംരംഭങ്ങളുടെ മന്ത്രാലയത്തിന്റെ സ്വന്തം കണക്കാണ്. ഇതിൽ കടകളും കച്ചവടക്കാരും ഉൾപ്പെട്ടേക്കാം.',
  'mknote.ministryManufacturing': 'ഇത് രജിസ്റ്റർ ചെയ്ത നിർമ്മാണ സംരംഭങ്ങളുടെ മന്ത്രാലയത്തിന്റെ സ്വന്തം കണക്കാണ്. ഓരോ സംരംഭത്തെയും അതിന്റെ പ്രധാന ജോലി അനുസരിച്ച് ഒരു തവണ മാത്രമേ എണ്ണുന്നുള്ളൂ.',
  'mknote.dairyProducts': 'നെയ്യ്, പനീർ, പാക്കറ്റ് പാൽ പോലുള്ള പാലുൽപ്പന്നങ്ങൾ ഉണ്ടാക്കുന്ന രജിസ്റ്റർ ചെയ്ത സംരംഭങ്ങളെയാണ് ഇതിൽ എണ്ണുന്നത്. പശുവിനെയോ എരുമയെയോ വളർത്തുന്ന ജോലി ഇതിൽ എണ്ണുന്നില്ല.',

  'cmd.wheat': 'ഗോതമ്പ്',
  'cmd.paddyCommon': 'നെല്ല്',
  'cmd.potato': 'ഉരുളക്കിഴങ്ങ്',
  'cmd.onion': 'ഉള്ളി',
  'cmd.tomato': 'തക്കാളി',
  'cmd.gingerGreen': 'പച്ച ഇഞ്ചി',
  'cmd.greenChilli': 'പച്ചമുളക്',
  'cmd.garlic': 'വെളുത്തുള്ളി',
  'cmd.mustard': 'കടുക്',
  'cmd.corianderLeaves': 'മല്ലിയില',
}

const kn = {
  'adv.reduceExpenses': 'ಅಗತ್ಯವಿಲ್ಲದ ಖರ್ಚುಗಳನ್ನು ಕಡಿಮೆ ಮಾಡಿ, ನಿಮ್ಮ ಬೆಲೆ ಸರಿಯಾಗಿದೆಯೇ ಎಂದು ನೋಡಿ.',
  'adv.growRevenue': 'ತಿಂಗಳ ಖರ್ಚನ್ನು ಹಾಗೇ ಇಟ್ಟುಕೊಂಡು ಆದಾಯ ಹೆಚ್ಚಿಸುವತ್ತ ಗಮನ ಕೊಡಿ.',
  'adv.maintainExpand': 'ಈಗ ನಡೆಯುತ್ತಿರುವಂತೆಯೇ ಮುಂದುವರಿಸಿ, ನಿಧಾನವಾಗಿ ಯೋಚಿಸಿ ಬೆಳೆಯಿರಿ.',
  'adv.improveMargin': 'ದೊಡ್ಡದು ಮಾಡುವ ಮೊದಲು, ಪ್ರತಿ ರೂಪಾಯಿಯಲ್ಲಿ ನಿಮ್ಮ ಬಳಿ ಎಷ್ಟು ಉಳಿಯುತ್ತದೆ ಎಂಬುದನ್ನು ಹೆಚ್ಚಿಸಿ.',
  'adv.healthyMargin': 'ನೀವು ಸಂಪಾದಿಸುವುದರಲ್ಲಿ ಒಳ್ಳೆಯ ಪಾಲು ನಿಮ್ಮ ಬಳಿ ಉಳಿಯುತ್ತದೆ, ಆದ್ದರಿಂದ ವ್ಯಾಪಾರ ಬೆಳೆಸುವುದು ನಿಮಗೆ ಸರಿಹೊಂದಬಹುದು.',
  'adv.cashReserve': 'ಹೊಸದಾಗಿ ಯಾವುದರಲ್ಲಾದರೂ ಹಣ ಹಾಕುವ ಮೊದಲು, ಕೈಯಲ್ಲಿ ಸಾಕಷ್ಟು ಹಣ ಕೂಡಿಸಿಟ್ಟುಕೊಳ್ಳಿ.',
  'adv.fundingGap': 'ವ್ಯಾಪಾರ ಶುರು ಮಾಡಲು ಬೇಕಾದ ಹಣವೆಲ್ಲಾ ಇನ್ನೂ ನಿಮ್ಮ ಬಳಿ ಇಲ್ಲ. ನಿಮ್ಮ ಕೆಲಸಕ್ಕೆ ಸಾಲ ಅಥವಾ ನೆರವಿಗಾಗಿ ಯೋಜನೆಗಳ ಪುಟ ನೋಡಿ. ತೀರಿಸಲು ಸಾಧ್ಯವಾಗುವುದಕ್ಕಿಂತ ಹೆಚ್ಚು ಸಾಲ ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ.',

  'obs.expensesExceedRevenue': 'ನೀವು ನಿರೀಕ್ಷಿಸಿದ ಖರ್ಚು, ನಿರೀಕ್ಷಿಸಿದ ಆದಾಯಕ್ಕಿಂತ ಹೆಚ್ಚಿದೆ.',
  'obs.breakEven': 'ವ್ಯಾಪಾರದಲ್ಲಿ ಖರ್ಚು ಮಾತ್ರ ವಾಪಸ್ ಬರುತ್ತದೆ ಎಂದು ಕಾಣುತ್ತದೆ.',
  'obs.positiveSurplus': 'ಪ್ರತಿ ತಿಂಗಳು ವ್ಯಾಪಾರದಲ್ಲಿ ಹಣ ಉಳಿಯುತ್ತದೆ ಎಂದು ಕಾಣುತ್ತದೆ.',
  'obs.lowMargin': 'ಪ್ರತಿ ರೂಪಾಯಿಯಲ್ಲಿ ಬಹಳ ಕಡಿಮೆ ಉಳಿಯುತ್ತದೆ. ಖರ್ಚು ಕಡಿಮೆ ಮಾಡಲು ಅಥವಾ ಆದಾಯ ಹೆಚ್ಚಿಸಲು ಪ್ರಯತ್ನಿಸಿ.',
  'obs.healthyMargin': 'ನೀವು ಸಂಪಾದಿಸುವುದರಲ್ಲಿ ಒಳ್ಳೆಯ ಪಾಲು ನಿಮ್ಮ ಬಳಿಯೇ ಉಳಿಯುತ್ತದೆ.',
  'obs.existingDebt': 'ಇನ್ನೊಂದು ಸಾಲ ತೆಗೆದುಕೊಳ್ಳುವ ಮೊದಲು, ಈಗಾಗಲೇ ಇರುವ ಸಾಲವನ್ನು ನೆನಪಿಟ್ಟುಕೊಳ್ಳಿ.',

  'rsn.noSurplus': 'ಸಾಲದ ಕಂತು ಕಟ್ಟಲು ತಿಂಗಳಲ್ಲಿ ಯಾವ ಹಣವೂ ಉಳಿಯುತ್ತಿಲ್ಲ.',
  'rsn.emiBelow30': 'ತಿಂಗಳಲ್ಲಿ ಉಳಿಯುವ ಹಣದ 30%ಕ್ಕಿಂತ ಕಡಿಮೆಯೇ ಕಂತಿಗೆ ಹೋಗುತ್ತದೆ.',
  'rsn.emi30to50': 'ತಿಂಗಳಲ್ಲಿ ಉಳಿಯುವ ಹಣದ 30% ರಿಂದ 50% ಕಂತಿಗೆ ಹೋಗುತ್ತದೆ.',
  'rsn.emiAbove50': 'ತಿಂಗಳಲ್ಲಿ ಉಳಿಯುವ ಹಣದ ಅರ್ಧಕ್ಕಿಂತ ಹೆಚ್ಚು ಕಂತಿಗೇ ಹೋಗುತ್ತದೆ.',
  'rsn.gapBelow30': 'ಇನ್ನೂ ಬೇಕಾದ ಹಣಕ್ಕಾಗಿ ಸಾಲವನ್ನೂ ಲೆಕ್ಕಕ್ಕೆ ತೆಗೆದುಕೊಂಡರೆ, ತಿಂಗಳಲ್ಲಿ ಉಳಿಯುವ ಹಣದ 30%ಕ್ಕಿಂತ ಕಡಿಮೆಯೇ ಕಂತುಗಳಿಗೆ ಹೋಗುತ್ತದೆ.',
  'rsn.gap30to50': 'ಇನ್ನೂ ಬೇಕಾದ ಹಣಕ್ಕಾಗಿ ಸಾಲವನ್ನೂ ಲೆಕ್ಕಕ್ಕೆ ತೆಗೆದುಕೊಂಡರೆ, ತಿಂಗಳಲ್ಲಿ ಉಳಿಯುವ ಹಣದ 30% ರಿಂದ 50% ಕಂತುಗಳಿಗೆ ಹೋಗುತ್ತದೆ.',
  'rsn.gapAbove50': 'ಇನ್ನೂ ಬೇಕಾದ ಹಣಕ್ಕಾಗಿ ಸಾಲವನ್ನೂ ಲೆಕ್ಕಕ್ಕೆ ತೆಗೆದುಕೊಂಡರೆ, ತಿಂಗಳಲ್ಲಿ ಉಳಿಯುವ ಹಣದ ಅರ್ಧಕ್ಕಿಂತ ಹೆಚ್ಚು ಕಂತುಗಳಿಗೇ ಹೋಗುತ್ತದೆ.',

  'sum.positive': 'ನಿಮ್ಮ ವ್ಯಾಪಾರ ಒಳ್ಳೆಯ ಸ್ಥಿತಿಯಲ್ಲಿದೆ.',
  'sum.needsAttention': 'ಹಣದ ವಿಷಯದಲ್ಲಿ ಇನ್ನೂ ಅಪಾಯ ತೆಗೆದುಕೊಳ್ಳುವ ಮೊದಲು ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕೆ ಗಮನ ಕೊಡಬೇಕು.',
  'sum.needsFunding': 'ನಿಮ್ಮ ಲೆಕ್ಕ ಸರಿಯಾಗಿ ಬರುತ್ತದೆ, ಆದರೆ ವ್ಯಾಪಾರ ಶುರು ಮಾಡಲು ಬೇಕಾದ ಹಣವೆಲ್ಲಾ ಇನ್ನೂ ನಿಮ್ಮ ಬಳಿ ಇಲ್ಲ.',
  'sum.reviewCarefully': 'ಮುಂದಿನ ನಿರ್ಧಾರ ತೆಗೆದುಕೊಳ್ಳುವ ಮೊದಲು ವ್ಯಾಪಾರದ ಹಣವನ್ನು ಎಚ್ಚರಿಕೆಯಿಂದ ನೋಡಿ.',

  'nxt.reducePressure': 'ಇನ್ನೊಂದು ಸಾಲ ತೆಗೆದುಕೊಳ್ಳುವ ಮೊದಲು ಕಂತಿನ ಹೊರೆಯನ್ನು ಕಡಿಮೆ ಮಾಡಿ.',
  'nxt.reviewExpenses': 'ನಿಮ್ಮ ಖರ್ಚನ್ನು ನೋಡಿ, ತಿಂಗಳಿಗೆ ಹೆಚ್ಚು ಸಂಪಾದಿಸುವ ದಾರಿ ಹುಡುಕಿ.',
  'nxt.reviewPlan': 'ಇನ್ನೂ ಹಣ ಹಾಕುವ ಮೊದಲು ನಿಮ್ಮ ವ್ಯಾಪಾರದ ಯೋಜನೆಯನ್ನು ಮತ್ತೆ ನೋಡಿ.',
  'nxt.gapTooLarge': 'ಇನ್ನೂ ಬೇಕಾದ ಹಣಕ್ಕಾಗಿ ತೆಗೆದುಕೊಳ್ಳಬೇಕಾದ ಸಾಲ, ತಿಂಗಳಲ್ಲಿ ಉಳಿಯುವ ಹಣಕ್ಕೆ ಹೋಲಿಸಿದರೆ ತುಂಬಾ ದೊಡ್ಡದು. ಚಿಕ್ಕದಾಗಿ ಶುರು ಮಾಡಿ, ಅಥವಾ ಮೊದಲು ಇನ್ನಷ್ಟು ಹಣವನ್ನು ನೀವೇ ಹೊಂದಿಸಿಕೊಳ್ಳಿ.',
  'nxt.arrangeGap': 'ಶುರು ಮಾಡುವ ಮೊದಲು, ಇನ್ನೂ ಬೇಕಾದ ಹಣ ಎಲ್ಲಿಂದ ಬರುತ್ತದೆ ಎಂದು ನಿರ್ಧರಿಸಿ. ಸಾಲ ತೆಗೆದುಕೊಂಡರೆ, ತೀರಿಸಲು ಸಾಧ್ಯವಾಗುವಷ್ಟು ಮಾತ್ರ ತೆಗೆದುಕೊಳ್ಳಿ.',
  'nxt.maintainDiscipline': 'ಹಣವನ್ನು ಈಗ ನಿಭಾಯಿಸುತ್ತಿರುವಂತೆಯೇ ಮುಂದುವರಿಸಿ, ಖರ್ಚಿನ ಮೇಲೆ ಕಣ್ಣಿಡಿ.',

  'why.categorySupported': 'ನಿಮ್ಮಂತಹ ಕೆಲಸಕ್ಕೆ ಈ ಯೋಜನೆ ನೆರವು ನೀಡುತ್ತದೆ ({categories}).',
  'why.stateAvailable': 'ಈ ಯೋಜನೆ ನಿಮ್ಮ ರಾಜ್ಯವೂ ಸೇರಿ ಎಲ್ಲಾ ರಾಜ್ಯಗಳಲ್ಲಿ ಸಿಗುತ್ತದೆ.',
  'why.stateSpecific': 'ಈ ಯೋಜನೆ ನಿಮ್ಮ ರಾಜ್ಯಕ್ಕೆ ಮಾತ್ರ.',
  'why.regionSpecific': 'ಈ ಯೋಜನೆ ಕೆಲವು ರಾಜ್ಯಗಳಿಗೆ ಮಾತ್ರ, ನಿಮ್ಮ ರಾಜ್ಯ ಅವುಗಳಲ್ಲಿ ಒಂದು.',





  'src.agmarknetMandi': 'ಅಗ್‌ಮಾರ್ಕ್‌ನೆಟ್‌ಗೆ ತಿಳಿಸಿದ ಮಂಡಿಯ ದಿನನಿತ್ಯದ ದರಗಳು, data.gov.in-ನಲ್ಲಿ ಪ್ರಕಟಿಸಲಾಗಿದೆ',
  'src.udyamList': 'ಉದ್ಯಮ್ ನೋಂದಣಿಗಳು, data.gov.in-ನಲ್ಲಿ ಪ್ರಕಟಿಸಲಾಗಿದೆ',
  'src.udyamAggregate': 'ಎಂಎಸ್ಎಂಇ ಸಚಿವಾಲಯದ ಜಿಲ್ಲಾವಾರು ಉದ್ಯಮ್ ನೋಂದಣಿ ಎಣಿಕೆ, data.gov.in-ನಲ್ಲಿ ಪ್ರಕಟಿಸಲಾಗಿದೆ',

  'mknote.ourGrouping': 'ನೋಂದಾಯಿತ ಯಾವ ಬಗೆಯ ಕೆಲಸಗಳನ್ನು ಈ ಅಂಕಿಯಲ್ಲಿ ಎಣಿಸಬೇಕು ಎಂದು ನಾವೇ ಆರಿಸಿದ್ದೇವೆ.',
  'mknote.ministryServices': 'ಇದು ನೋಂದಾಯಿತ ಸೇವಾ ವ್ಯವಹಾರಗಳ ಬಗ್ಗೆ ಸಚಿವಾಲಯದ ಸ್ವಂತ ಎಣಿಕೆ. ಇದರಲ್ಲಿ ಅಂಗಡಿಗಳು ಮತ್ತು ವ್ಯಾಪಾರಿಗಳೂ ಸೇರಿರಬಹುದು.',
  'mknote.ministryManufacturing': 'ಇದು ನೋಂದಾಯಿತ ತಯಾರಿಕಾ ವ್ಯವಹಾರಗಳ ಬಗ್ಗೆ ಸಚಿವಾಲಯದ ಸ್ವಂತ ಎಣಿಕೆ. ಇದು ಪ್ರತಿ ವ್ಯವಹಾರವನ್ನು ಅದರ ಮುಖ್ಯ ಕೆಲಸದ ಆಧಾರದ ಮೇಲೆ ಒಂದೇ ಸಲ ಎಣಿಸುತ್ತದೆ.',
  'mknote.dairyProducts': 'ಇದರಲ್ಲಿ ತುಪ್ಪ, ಪನೀರ್, ಪ್ಯಾಕೆಟ್ ಹಾಲಿನಂತಹ ಹಾಲಿನ ಉತ್ಪನ್ನಗಳನ್ನು ತಯಾರಿಸುವ ನೋಂದಾಯಿತ ವ್ಯವಹಾರಗಳನ್ನು ಎಣಿಸಲಾಗಿದೆ. ಹಸು, ಎಮ್ಮೆ ಸಾಕುವ ಕೆಲಸವನ್ನು ಇದರಲ್ಲಿ ಎಣಿಸಿಲ್ಲ.',

  'cmd.wheat': 'ಗೋಧಿ',
  'cmd.paddyCommon': 'ಭತ್ತ',
  'cmd.potato': 'ಆಲೂಗಡ್ಡೆ',
  'cmd.onion': 'ಈರುಳ್ಳಿ',
  'cmd.tomato': 'ಟೊಮೆಟೊ',
  'cmd.gingerGreen': 'ಹಸಿ ಶುಂಠಿ',
  'cmd.greenChilli': 'ಹಸಿ ಮೆಣಸಿನಕಾಯಿ',
  'cmd.garlic': 'ಬೆಳ್ಳುಳ್ಳಿ',
  'cmd.mustard': 'ಸಾಸಿವೆ',
  'cmd.corianderLeaves': 'ಕೊತ್ತಂಬರಿ ಸೊಪ್ಪು',
}

const mr = {
  'adv.reduceExpenses': 'गरज नसलेला खर्च कमी करा, आणि तुमचे दर योग्य आहेत का ते पाहा।',
  'adv.growRevenue': 'महिन्याचा खर्च तेवढाच ठेवून कमाई वाढवण्याकडे लक्ष द्या।',
  'adv.maintainExpand': 'आता जसे चालू आहे तसेच चालू ठेवा, आणि हळूहळू विचार करून वाढा।',
  'adv.improveMargin': 'मोठे करण्यापूर्वी, प्रत्येक रुपयातून तुमच्याकडे किती उरते ते वाढवा।',
  'adv.healthyMargin': 'तुमच्या कमाईचा चांगला भाग तुमच्याकडे उरतो, म्हणून व्यवसाय वाढवणे तुम्हाला जमू शकेल।',
  'adv.cashReserve': 'नवीन कशात पैसे घालण्यापूर्वी, हाताशी पुरेसे पैसे साठवून ठेवा।',
  'adv.fundingGap': 'व्यवसाय सुरू करण्यासाठी लागणारे सगळे पैसे अजून तुमच्याकडे नाहीत। तुमच्या कामासाठी कर्ज किंवा मदत मिळते का ते योजनांच्या पानावर पाहा, आणि फेडता येईल त्यापेक्षा जास्त कर्ज घेऊ नका।',

  'obs.expensesExceedRevenue': 'तुम्ही धरलेला खर्च, तुम्ही धरलेल्या कमाईपेक्षा जास्त आहे।',
  'obs.breakEven': 'व्यवसायातून फक्त खर्चच निघेल असे दिसते।',
  'obs.positiveSurplus': 'दर महिन्याला व्यवसायात पैसे उरतील असे दिसते।',
  'obs.lowMargin': 'प्रत्येक रुपयातून फारच थोडे उरते. खर्च कमी करण्याचा किंवा कमाई वाढवण्याचा प्रयत्न करा।',
  'obs.healthyMargin': 'तुम्ही कमावता त्यातला चांगला भाग तुमच्याकडेच राहतो।',
  'obs.existingDebt': 'दुसरे कर्ज घेण्यापूर्वी, आधीच असलेल्या कर्जाचा विचार करा।',

  'rsn.noSurplus': 'कर्जाचा हप्ता भरण्यासाठी महिन्याला कोणतेही पैसे उरत नाहीत।',
  'rsn.emiBelow30': 'महिन्याला उरणाऱ्या पैशांपैकी 30% पेक्षा कमीच हप्त्यात जाते।',
  'rsn.emi30to50': 'महिन्याला उरणाऱ्या पैशांपैकी 30% ते 50% हप्त्यात जाते।',
  'rsn.emiAbove50': 'महिन्याला उरणाऱ्या पैशांपैकी निम्म्याहून जास्त हप्त्यातच जाते।',
  'rsn.gapBelow30': 'अजून लागणाऱ्या पैशांसाठीचे कर्जही धरले, तर महिन्याला उरणाऱ्या पैशांपैकी 30% पेक्षा कमीच हप्त्यांत जाईल।',
  'rsn.gap30to50': 'अजून लागणाऱ्या पैशांसाठीचे कर्जही धरले, तर महिन्याला उरणाऱ्या पैशांपैकी 30% ते 50% हप्त्यांत जाईल।',
  'rsn.gapAbove50': 'अजून लागणाऱ्या पैशांसाठीचे कर्जही धरले, तर महिन्याला उरणाऱ्या पैशांपैकी निम्म्याहून जास्त हप्त्यांतच जाईल।',

  'sum.positive': 'तुमचा व्यवसाय चांगल्या स्थितीत आहे।',
  'sum.needsAttention': 'पैशाचा अजून धोका घेण्यापूर्वी तुमच्या व्यवसायाकडे लक्ष देणे आवश्यक आहे।',
  'sum.needsFunding': 'तुमचा हिशोब जुळतो, पण व्यवसाय सुरू करण्यासाठी लागणारे सगळे पैसे अजून तुमच्याकडे नाहीत।',
  'sum.reviewCarefully': 'पुढचा निर्णय घेण्यापूर्वी व्यवसायाच्या पैशाकडे काळजीपूर्वक पाहा।',

  'nxt.reducePressure': 'दुसरे कर्ज घेण्यापूर्वी हप्त्याचा भार कमी करा।',
  'nxt.reviewExpenses': 'तुमचा खर्च पाहा, आणि महिन्याला जास्त कमावण्याचे मार्ग शोधा।',
  'nxt.reviewPlan': 'अजून पैसे घालण्यापूर्वी तुमची व्यवसायाची योजना पुन्हा पाहा।',
  'nxt.gapTooLarge': 'अजून लागणाऱ्या पैशांसाठी घ्यावे लागणारे कर्ज, महिन्याला उरणाऱ्या पैशांच्या मानाने खूप मोठे आहे। लहान सुरुवात करा, किंवा आधी आणखी पैसे स्वतः उभे करा।',
  'nxt.arrangeGap': 'सुरुवात करण्यापूर्वी, अजून लागणारे पैसे कुठून येणार ते ठरवा, आणि कर्ज घेतलेच तर फेडता येईल तेवढेच घ्या।',
  'nxt.maintainDiscipline': 'पैसे आता जसे सांभाळत आहात तसेच सांभाळत राहा, आणि खर्चावर लक्ष ठेवा।',

  'why.categorySupported': 'तुमच्यासारख्या कामाला ही योजना मदत करते ({categories})।',
  'why.stateAvailable': 'ही योजना तुमच्या राज्यासह प्रत्येक राज्यासाठी आहे।',
  'why.stateSpecific': 'ही योजना फक्त तुमच्या राज्यासाठी आहे।',
  'why.regionSpecific': 'ही योजना काही राज्यांसाठीच आहे, आणि तुमचे राज्य त्यांपैकी एक आहे।',





  'src.agmarknetMandi': 'एगमार्कनेटला कळवलेले मंडीतील रोजचे भाव, data.gov.in वर प्रकाशित',
  'src.udyamList': 'उद्यम नोंदणी, data.gov.in वर प्रकाशित',
  'src.udyamAggregate': 'एमएसएमई मंत्रालयाची जिल्हानिहाय उद्यम नोंदणीची संख्या, data.gov.in वर प्रकाशित',

  'mknote.ourGrouping': 'नोंदवलेल्या कोणत्या प्रकारच्या कामांना या आकड्यात मोजायचे, हे आम्ही ठरवले आहे।',
  'mknote.ministryServices': 'ही नोंदवलेल्या सेवा व्यवसायांची मंत्रालयाची स्वतःची मोजणी आहे। यात दुकाने आणि व्यापारीही असू शकतात।',
  'mknote.ministryManufacturing': 'ही नोंदवलेल्या उत्पादन व्यवसायांची मंत्रालयाची स्वतःची मोजणी आहे। यात प्रत्येक व्यवसाय त्याच्या मुख्य कामानुसार एकदाच मोजला जातो।',
  'mknote.dairyProducts': 'यात तूप, पनीर किंवा पिशवीतील दूध असे दुधाचे पदार्थ बनवणारे नोंदवलेले व्यवसाय मोजले आहेत। गाई-म्हशी पाळण्याचे काम यात मोजलेले नाही।',

  'cmd.wheat': 'गहू',
  'cmd.paddyCommon': 'भात',
  'cmd.potato': 'बटाटा',
  'cmd.onion': 'कांदा',
  'cmd.tomato': 'टोमॅटो',
  'cmd.gingerGreen': 'ओले आले',
  'cmd.greenChilli': 'हिरवी मिरची',
  'cmd.garlic': 'लसूण',
  'cmd.mustard': 'मोहरी',
  'cmd.corianderLeaves': 'कोथिंबीर',
}

const bn = {
  'adv.reduceExpenses': 'দরকার নেই এমন খরচ কমান, আর দেখুন আপনার দাম ঠিক আছে কি না।',
  'adv.growRevenue': 'মাসের খরচ একই রেখে আয় বাড়ানোর দিকে নজর দিন।',
  'adv.maintainExpand': 'এখন যেমন চলছে তেমনই চালিয়ে যান, আর ধীরে ধীরে ভেবে বাড়ান।',
  'adv.improveMargin': 'বড় করার আগে, প্রতি টাকায় আপনার হাতে কত থাকে সেটা বাড়ান।',
  'adv.healthyMargin': 'আপনার আয়ের ভালো একটা অংশ আপনার হাতে থাকে, তাই ব্যবসা বাড়ানো আপনার জন্য মানানসই হতে পারে।',
  'adv.cashReserve': 'নতুন কিছুতে টাকা লাগানোর আগে, হাতে যথেষ্ট টাকা জমিয়ে রাখুন।',
  'adv.fundingGap': 'ব্যবসা শুরু করতে যত টাকা দরকার, তার সবটা এখনও আপনার হাতে নেই। আপনার কাজের জন্য ঋণ বা সাহায্যের খোঁজে প্রকল্পের পাতাটি দেখুন, আর যতটা শোধ করতে পারবেন তার বেশি ঋণ নেবেন না।',

  'obs.expensesExceedRevenue': 'আপনি যে খরচ ধরেছেন, তা আপনার ধরা আয়ের চেয়ে বেশি।',
  'obs.breakEven': 'ব্যবসায় শুধু খরচটুকুই উঠে আসবে বলে মনে হচ্ছে।',
  'obs.positiveSurplus': 'প্রতি মাসে ব্যবসায় টাকা বাঁচবে বলে মনে হচ্ছে।',
  'obs.lowMargin': 'প্রতি টাকায় খুব কমই থাকে। খরচ কমানোর বা আয় বাড়ানোর চেষ্টা করুন।',
  'obs.healthyMargin': 'আপনি যা আয় করেন তার ভালো একটা অংশ আপনার কাছেই থাকে।',
  'obs.existingDebt': 'আরেকটা ঋণ নেওয়ার আগে, আগে থেকে যে ঋণ আছে সেটা মনে রাখুন।',

  'rsn.noSurplus': 'ঋণের কিস্তি দেওয়ার জন্য মাসে কোনো টাকা বাঁচে না।',
  'rsn.emiBelow30': 'মাসে যা টাকা বাঁচে তার 30% এরও কম কিস্তিতে যায়।',
  'rsn.emi30to50': 'মাসে যা টাকা বাঁচে তার 30% থেকে 50% কিস্তিতে যায়।',
  'rsn.emiAbove50': 'মাসে যা টাকা বাঁচে তার অর্ধেকের বেশি কিস্তিতেই চলে যায়।',
  'rsn.gapBelow30': 'এখনও যে টাকা দরকার তার ঋণও ধরলে, মাসে যা টাকা বাঁচে তার 30% এরও কম কিস্তিতে যাবে।',
  'rsn.gap30to50': 'এখনও যে টাকা দরকার তার ঋণও ধরলে, মাসে যা টাকা বাঁচে তার 30% থেকে 50% কিস্তিতে যাবে।',
  'rsn.gapAbove50': 'এখনও যে টাকা দরকার তার ঋণও ধরলে, মাসে যা টাকা বাঁচে তার অর্ধেকের বেশি কিস্তিতেই চলে যাবে।',

  'sum.positive': 'আপনার ব্যবসা ভালো অবস্থায় আছে।',
  'sum.needsAttention': 'টাকার আরও ঝুঁকি নেওয়ার আগে আপনার ব্যবসার দিকে নজর দেওয়া দরকার।',
  'sum.needsFunding': 'আপনার হিসাব মিলছে, কিন্তু ব্যবসা শুরু করতে যত টাকা দরকার তার সবটা এখনও আপনার হাতে নেই।',
  'sum.reviewCarefully': 'পরের সিদ্ধান্ত নেওয়ার আগে ব্যবসার টাকার হিসাব ভালো করে দেখুন।',

  'nxt.reducePressure': 'আরেকটা ঋণ নেওয়ার আগে কিস্তির চাপ কমান।',
  'nxt.reviewExpenses': 'আপনার খরচ দেখুন, আর মাসে বেশি আয়ের পথ খুঁজুন।',
  'nxt.reviewPlan': 'আরও টাকা লাগানোর আগে আপনার ব্যবসার পরিকল্পনা আবার দেখুন।',
  'nxt.gapTooLarge': 'এখনও যে টাকা দরকার তার জন্য যে ঋণ নিতে হবে, মাসে যা টাকা বাঁচে তার তুলনায় তা অনেক বড়। ছোট করে শুরু করুন, বা আগে নিজে আরও কিছু টাকা জোগাড় করুন।',
  'nxt.arrangeGap': 'শুরু করার আগে ঠিক করুন, এখনও যে টাকা দরকার তা কোথা থেকে আসবে, আর ঋণ নিলে ততটাই নিন যতটা শোধ করতে পারবেন।',
  'nxt.maintainDiscipline': 'টাকা এখন যেভাবে সামলাচ্ছেন সেভাবেই চালিয়ে যান, আর খরচের দিকে নজর রাখুন।',

  'why.categorySupported': 'আপনার মতো কাজে এই প্রকল্প সাহায্য করে ({categories})।',
  'why.stateAvailable': 'এই প্রকল্প আপনার রাজ্য সহ সব রাজ্যের জন্য।',
  'why.stateSpecific': 'এই প্রকল্প কেবল আপনার রাজ্যের জন্য।',
  'why.regionSpecific': 'এই প্রকল্প কেবল কয়েকটি রাজ্যের জন্য, আর আপনার রাজ্য সেগুলির একটি।',





  'src.agmarknetMandi': 'অ্যাগমার্কনেটে জানানো মণ্ডির দৈনিক দাম, data.gov.in-এ প্রকাশিত',
  'src.udyamList': 'উদ্যম নিবন্ধন, data.gov.in-এ প্রকাশিত',
  'src.udyamAggregate': 'এমএসএমই মন্ত্রকের জেলাভিত্তিক উদ্যম নিবন্ধনের সংখ্যা, data.gov.in-এ প্রকাশিত',

  'mknote.ourGrouping': 'নথিভুক্ত কোন কোন ধরনের কাজ এই সংখ্যায় গোনা হবে, তা আমরাই বেছে নিয়েছি।',
  'mknote.ministryServices': 'এটি নথিভুক্ত পরিষেবা ব্যবসার মন্ত্রকের নিজস্ব গণনা। এতে দোকান আর ব্যবসায়ীরাও থাকতে পারেন।',
  'mknote.ministryManufacturing': 'এটি নথিভুক্ত উৎপাদন ব্যবসার মন্ত্রকের নিজস্ব গণনা। এতে প্রতিটি ব্যবসাকে তার মূল কাজ ধরে একবারই গোনা হয়।',
  'mknote.dairyProducts': 'এতে ঘি, পনির বা প্যাকেটের দুধের মতো দুগ্ধজাত জিনিস তৈরি করে এমন নথিভুক্ত ব্যবসা গোনা হয়েছে। গরু বা মোষ পালনের কাজ এতে গোনা হয়নি।',

  'cmd.wheat': 'গম',
  'cmd.paddyCommon': 'ধান',
  'cmd.potato': 'আলু',
  'cmd.onion': 'পেঁয়াজ',
  'cmd.tomato': 'টমেটো',
  'cmd.gingerGreen': 'কাঁচা আদা',
  'cmd.greenChilli': 'কাঁচা লঙ্কা',
  'cmd.garlic': 'রসুন',
  'cmd.mustard': 'সরষে',
  'cmd.corianderLeaves': 'ধনেপাতা',
}

export const BACKEND_STRINGS = { en, hi, ta, te, ml, kn, mr, bn }
