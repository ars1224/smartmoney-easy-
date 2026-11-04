# Learn page

Learn provides four original SmartMoney guides on budgeting, saving, spending and financial safety, plus automatically discovered Yahoo Finance personal-finance reading. Original guides remain separate from external articles. The responsive page uses the existing shell, tokens, cards and buttons. No database migration or Mock Bank connection is needed.

## Automatic personal-finance reading

The authenticated `GET /api/learn/articles` fetches public Google News RSS search results restricted to `site:finance.yahoo.com/personal-finance` and money-skill keywords. This replaces the earlier S&P 500 feed; it never falls back to unrelated market news. No key, paid service or account is needed for this public endpoint. It is an undocumented discovery feed, not an official Yahoo API or a service with an uptime guarantee.

The query targets budgeting, saving, emergency funds, debt, spending, scams and fraud over the last year. It requests the NZ English edition, but this does NOT make the articles NZ-specific. Results can discuss US banking products, rules, spelling and currencies; the UI states the geographic limitation.

Each Google RSS entry must identify Yahoo Finance as its source with source URL `https://finance.yahoo.com`, and its article link must be an HTTPS Google News `/rss/articles/` or `/articles/` link. The backend also rejects stock/earnings headlines and obvious bank-review, rate-ranking and bonus promotions. Matching titles are tagged by simple keyword rules (not personalised AI recommendations), ordered by the supplied dates, and limited to 12. These checks improve relevance but are not a full editorial review of article bodies.

The page displays the exact feed title, source, topic, supplied feed date when present (explicitly not a verified publisher update date), and an explicitly labelled `Read via Google News` link. Google News directs the reader to the source article. No opaque-URL decoding or private Google endpoints are used. Only headline metadata is fetched; no copied article bodies, summaries, publisher thumbnails, invented authors or dates are included. Licensed stock photographs illustrate the four original SmartMoney guides only.

`YAHOO_FINANCE_RSS_URL` can override the default from local `backend/.env`. An empty value disables fetching. No client query parameter can select a URL. Allowed feed hosts are Yahoo Finance RSS hosts and Google News `/rss/search` constrained to Yahoo personal-finance results. Redirects are not followed by the server. Responses are size/time limited and parsed using defusedxml. Successful reads cache for 15 minutes; failures back off for 60 seconds and cached headlines remain explicitly stale for at most 24 hours. Fetching occurs on page/API access, not a background scheduler. Caches reset with Flask and are per process.

## Photography

PNW Production, "Close-up of an Open Notebook, Calculator and a Pen", Pexels photo 8250947.
Source: https://www.pexels.com/photo/close-up-of-an-open-notebook-calculator-and-a-pen-8250947/
Licence verified 27 October 2026: https://www.pexels.com/license/
Local file: `src/assets/learn/budget-notebook.jpg`, a 1200px compressed copy.

Pexels permits free website/app use and modification without implying endorsement. A visible credit is included. This is stock photography, not a SmartMoney author/customer image. A failed image removes the photo column without blocking the guide. All four original guides have licensed photographs; external articles use a balanced text layout.

## Verification

From backend:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_learn_articles.py
```

From the project root: `npm run lint`, `npm test -- --watch=false`, `npm run build`.

Tests cover source/relevance checks, unsafe URLs, XML safety, cache/stale behavior, session protection, search/topic filtering, image fallback and truthful Google News attribution. Browser checks cover desktop/mobile layout, search/reset, reading dialog keyboard access and Escape focus restoration. Learn is below its stylesheet warning budget; existing Dashboard and Savings Goals warnings remain.

On 27 October 2026 the topic-search RSS returned HTTP 200 with Yahoo personal-finance entries. The actual Flask parser returned relevant budgeting, saving and debt articles. This verifies current operation, not continuous availability. No source changes have been committed or pushed.

Source-link verification: opened the emergency-fund result in the browser; Google News redirected to the actual Yahoo Personal Finance article. Its displayed date differed from the feed date, so Google-derived dates are labelled `Feed date` and the page explains this distinction.


## Interactive lessons and photography
The overview shows four one-minute lessons, a fictional two-message scam challenge, and three external articles with Show more. Feedback explains warning signs without guaranteeing that another message is safe. Challenge reference: https://www.ownyouronline.govt.nz/personal/know-the-risks/common-risks-and-threats/text-message-scams/ . No scores or answers are stored. Source details remain available in an expandable disclosure.

Additional Pexels photographs (free website use under https://www.pexels.com/license/):
- Savings jar: Towfiqu barbhuiya, https://www.pexels.com/photo/clear-glass-jar-with-silver-coins-9821387/
- Groceries: Tima Miroshnichenko, https://www.pexels.com/photo/a-person-holding-a-basket-of-fresh-vegetables-7879906/
- Phone: cottonbro studio, https://www.pexels.com/photo/person-using-smartphone-7343000/

Photography illustrates original lessons only; publisher thumbnails are not copied. Missing images use a topic fallback. Brief card entry, hover and feedback transitions respect prefers-reduced-motion.

The quick challenge now contains five manually navigated questions: scam warning signs, occasional bills, subscription arithmetic, savings arithmetic and unexpected expenses. Previous/Next stop at the endpoints; question position is announced, focus moves to the new heading, and answers are retained in memory while navigating. Try again resets only the current question. There is no automatic rotation or persistent score. Slide transitions respect reduced motion.

## Daily challenges
30 original learning questions, six per topic: budgeting, saving, spending, staying safe and debt basics. A deterministic local-calendar-day schedule chooses one per topic and shuffles the daily order and most answer positions. Adjacent days have no repeated question IDs. The same six topic selections cycle after six days, with different daily ordering; this is a finite bank, not generated financial advice. The original phone-message labels remain fixed.

Daily answers, position and completion are stored at smartmoney.learn.daily.v1 in localStorage. No financial/account data is stored. State is browser-wide, not account-specific or synced. Clearing browser data clears progress. Practice rounds do not overwrite daily progress; reload returns to the daily set. Storage failures fall back to an in-memory round. Daily rollover follows device local time, checked on focus, actions and every minute.

Practice selects a fresh question per topic, excluding today and the preceding practice round where possible. All 30 questions have explanatory visuals and answer-driven reveals, with practical takeaways. Educational content references: https://www.workandincome.govt.nz/eligibility/living-expenses/budgeting.html , https://assets.sorted.org.nz/public/2022-booklets/Sorted-Debt-booklet-2024_WEB.pdf , https://www.consumerprotection.govt.nz/general-help/scamwatch/identify-a-scam . Arithmetic and examples are original and illustrative, not live rates or personalised advice.

## Final section naming and layout
The section is named Daily Money Check (Practice Money Check in practice mode). Its component is DailyChallengeComponent in daily-challenge.component.*, with ChallengeStoryComponent and ChallengeSceneComponent for visuals. Stable question IDs and the existing storage key preserve daily progress. Desktop layout places the situation and answers in aligned columns beneath the question; mobile stacks these in reading order. Practical takeaways have their own inset panel.

## Guide reader
Original guides open in GuideReaderComponent, a native modal dialog with licensed photo credits, topic/read-time metadata, three numbered sections, a distinct practical takeaway and a fixed next-step link. The body scrolls independently. Close and Escape return focus to the guide trigger. A failed photo falls back to the text introduction. Motion follows reduced-motion preferences. Yahoo articles continue opening externally; full publisher articles are not copied or embedded. Unit tests use a native-dialog shim because the test DOM lacks showModal; Escape/focus and mobile layout are checked in the browser.
