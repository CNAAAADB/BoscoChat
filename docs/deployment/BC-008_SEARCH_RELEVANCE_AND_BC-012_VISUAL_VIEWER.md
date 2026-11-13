# BC-008 / BC-011 / BC-012 — Search relevance and original PDF viewing

2026-11-13. The owner tested production and reported two distinct shortcomings.

## Search behavior change in this PR
- Default search mode is **relevance**: MySQL InnoDB FULLTEXT natural-language ranking, which does not require every word to appear.
- Optional **all words (AND)**, **any word (OR)**, **exact phrase** via a validated mode enum; inputs are sanitized into word tokens and always bound as query parameters. Public discovery still returns up to 10 pages and is rate-limited by the existing MySQL-backed limiter.
- Contextual OCR excerpts around a matching word, with HTML-safe React highlighting; year filter preserved.
- Constraints: MySQL full-text search is lexical, not a semantic/LLM answer engine; it does not understand the *meaning* of a question, synonyms or historic OCR errors. Common stopwords and words shorter than the MySQL FULLTEXT token threshold may be ignored. Natural-language ranking requires representative performance and recall testing against the complete corpus.

## Visual PDF viewer — release gate, NOT enabled here
- Current frontend uses text-only OCR whenever `VITE_ARCHIVE_PDF_VIEW` is absent/false. The experimental protected range-serving backend route exists only when `ARCHIVE_PDF_VIEW_ENABLED=true`.
- Turning on those flags without proper browser, IAM, size and abuse testing is **not** enough. In particular: document originals are private, login is cross-origin; browsers may block third-party cookies; native PDF viewer shows a download button; HTTP API binary responses/range headers and Lambda/S3 bandwidth have to be tested; RF-DOC-03 requires a user-associated invisible watermark.
- The correct BC-012 implementation will present a **rendered page** (not raw OCR), ideally canvas via a reviewed PDF.js viewer or controlled server-rendered page tiles, with page navigation and zoom. It must obtain bytes through an authenticated route, enforce user authorization and rate/size controls, and avoid exposing public S3 URLs. The viewer and watermark need independent security review before production enablement.
- No changes in this PR enable PDF access or relax document authorization.

## Independent verification and rollout
- Confirm CI backend tests, frontend ESLint/build, real MySQL FULLTEXT behavior for common Spanish questions, phrase matching and 10-result cap.
- Check results on `boscochat.com` after backend GitHub deployment and Amplify deployment from `main`; verify search still public without exposing protected original pages.
- BC-008/011 remain in review until broader criteria are met; BC-012 remains BLOCKED.
