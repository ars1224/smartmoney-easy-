# Learn page file map

Keep this feature together in its current folder. Formatting does not require moving files or changing routes.

## Entry point

`/app/learn` is lazy-loaded from `src/app/app.routes.ts` through `learn.page.ts`.

| Files | Responsibility |
| --- | --- |
| `learn.page.ts`, `.html`, `.scss` | Compose Learn; define financial guides; filter/search guides and articles; load the authenticated article feed and handle unavailable/stale states. |
| `getting-started.component.*` | Expandable app setup and everyday-use instructions with links to existing pages. |
| `common-questions.component.*` | Expandable app FAQs and the action that opens Thinker. |
| `guide-reader.component.*` | Financial-guide dialog, image credits, takeaway, page link and close behaviour. |
| `daily-challenge.component.*` | Daily/practice challenge interaction, answer feedback and browser-local progress. |
| `daily-challenges.ts` | Daily selection, practice selection and saved-progress validation helpers. |
| `challenge-bank.ts` | Question bank and supporting scenario content. |
| `challenge-story.component.*` | Scenario storytelling within a challenge. |
| `challenge-scene.component.*` | Supporting scenario visuals. |
| `*.spec.ts` | Tests beside the components/helpers they cover. `app-help.spec.ts` covers shared help content, links and interactions. |

Here, `component.*` means the corresponding TypeScript, HTML and SCSS files, plus a test where one exists.

## Shared content and backend dependencies

- `src/app/shared/app-help.ts` resolves the shared guide and trusted page links.
- `backend/app/content/app-help.json` is the canonical public app-instruction source shared by Learn and Thinker. Update this source when app flows change; do not duplicate instructions here.
- `backend/app/services/app_help.py` selects prepared app-help replies and safe navigation IDs.
- `learn.page.ts` requests `/api/learn/articles`. Backend article discovery and validation live in `backend/app/services/learn_articles.py`.
- Guide photos live in `src/assets/learn/`.
- Daily progress uses `smartmoney.learn.daily.v1` in this browser's local storage; it is not account or cross-device history.
- Shared UI components, the shell and Thinker remain outside this folder.

## Working safely

Keep existing filenames, exports, component selectors, template/style paths and route imports when performing formatting-only maintenance. Preserve question IDs, answer mappings, content wording and local-storage keys. Folder restructuring should be a separate reviewed change with imports and tests updated together.

## Checks

Run from the repository root:

```sh
npm test -- --watch=false --include="src/app/pages/learn/**/*.spec.ts"
npx eslint "src/app/pages/learn/**/*.ts" "src/app/pages/learn/**/*.html"
npm run build
```

For shared app-help and article backend tests, run from `backend/` using the project's Python environment:

```sh
python -m unittest discover -s tests -p test_app_help.py
python -m unittest discover -s tests -p test_learn_articles.py
```

Use dummy accounts for browser checks. Verify guide/FAQ expansion, search/filter behaviour, daily/practice progress, modal keyboard close and focus return, mobile layouts and article-feed failure recovery. See `docs/LEARN.md` and `docs/LEARN_APP_GUIDE.md` for additional behaviour and limitations.
