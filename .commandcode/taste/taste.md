# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# project-setup
- Provide a single entry point (Makefile at root) for non-technical users. Confidence: 1
- Setup and installation must be fully automated with zero manual interruption. Confidence: 1
- Verify TypeScript compilation by running `npx tsc --noEmit` (backend) and `cd dashboard && npx tsc --noEmit` (frontend) after making changes. Confidence: 0.65
- Use `~` version pinning (patch-level control) for production dependencies to prevent unexpected breaking changes from minor version updates. Confidence: 0.80

# workflow
See [workflow/taste.md](workflow/taste.md)
# python-tooling
- Apply formatting and linting changes only to files that have been modified, rather than formatting the entire project blindly. Confidence: 0.90
- Enforce project-standard formatting using Black (88-character limit) and Ruff for quick fixes. Confidence: 1
- Treat Flake8 static analysis as a blocker: fix all issues before committing and never ignore warnings. Confidence: 1

# code-structure
- Enforce a hard limit of 300 lines per file; immediately split exceeding files into smaller, domain-specific modules. Confidence: 1
- Keep functions small, unit-testable, and strictly adhering to the Single Responsibility Principle. Confidence: 0.95
- Use descriptive, verb-noun naming conventions (e.g., `load_config_file()`) and strictly avoid vague variable names like `data`, `temp`, `info`, or `util`. Confidence: 1
- Prefer dependency injection over internal imports or global state management. Confidence: 0.85

# code-patterns
- Design code to be explicit, flat, and sparse rather than implicit, nested, and dense (adhere to the Zen of Python philosophy). Confidence: 0.85
- Maintain strict separation of concerns and clear boundaries between Data, Business Logic, and I/O layers. Confidence: 0.95
- Favor composition over inheritance, and implement design patterns (Factory, Builder, Strategy) only when they measurably simplify the code. Confidence: 0.90
- Reuse existing proven infrastructure and utilities (rate-limiting, anti-ban, broadcast, and WAF-bypass pipelines like BrowserFetchUtil's image fetch) instead of building ad-specific duplication — the user explicitly directs reuse of "already proven working" pipelines. Confidence: 0.75
- Percent-encode non-ASCII image URLs (e.g., Devanagari/Marathi filenames on the client's WordPress site) via `new URL(raw, base).href` before fetching, and normalize URL comparisons by decoding both sides (safe `decodeURIComponent` + strip trailing slash/query/hash) before matching — the site serves raw Unicode in og:image while article URLs stay ASCII (/news/NNNNN/). The percent-encoding must also be applied to the HTML served to WhatsApp's native crawler (rewrite `og:image`/`twitter:image` to the encoded ASCII URL and pass the rewritten HTML as `pageHtml`) — that URL-layer rewrite was the accepted root-cause fix for the Devanagari link-preview failures, letting WA's native crawl succeed exactly like English-filename articles (user: "we just had to handle the non-ASCII image filename"). Note: a single 17-article dump showed some ASCII-named images ALSO failing, split by WA's flaky native crawl — so encoding alone doesn't cover WAF/flakiness cases, but for the Unicode-filename case the URL rewrite is the primary fix and the fallback pipeline is only a safety net. Follow-up evidence (Senderrr.log after the rewrite deployed) tempered this: the rewritten HTML was indeed served (htmlLen=244826 vs 245635) and all fetches used the encoded URL, yet native still returned `nativeThumbLen=0` — WA's server-side crawler cannot reach the Hostinger-hosted origin at all (network-level WAF block, independent of the filename), so the URL rewrite is necessary but not sufficient on its own; native success additionally requires the crawler to be able to reach the origin. Confidence: 0.6

# error-handling
- Never let errors pass silently unless they are explicitly caught, silenced, and documented. Confidence: 1
- Show user-friendly messages for internal token errors (e.g. WhatsApp tokens) instead of cryptic technical error messages like "invalid or expired token". Confidence: 1
- Implement a global error banner mechanism across all components that shows human-readable messages without trace or technical details in non-debugging mode. Confidence: 0.85
- When using Puppeteer browser for WAF/CORS bypass fallback, the HTTP status trigger list must be comprehensive — include 403, 503, 406 **and 429 (Too Many Requests)**. Hostinger and similar WAFs commonly return 429 on rate-limit, and missing it from the fallback trigger causes the fetch to throw immediately without falling back to the browser. Confidence: 1
- Gracefully degrade on failure — isolate errors to the individual feature so one component crashing doesn't bring down the entire app. Confidence: 1

# react
- In React functional components, declare all `useState` variables (and their initializers) physically before any custom hooks or query hooks that reference them — never after. JavaScript's temporal dead zone with block-scoped `const` will cause "used before declaration" errors at build time. Confidence: 0.90

# loading-states
- Use real component-specific skeletons and spinners for all async operations, not generic/fake loading indicators — e.g., show a skeleton of the QR code with a spinner overlay while session is initializing. Confidence: 1
- Never return the full-page skeleton inside the component's return when `isLoading` is true unconditionally — this unmounts the input on every refetch, destroying focus, scroll position, and other DOM state. Only render skeletons on initial load (e.g. `isLoading && data.length === 0`); show subtle inline spinners or status indicators during background refetches so the page stays mounted. Confidence: 1

# ui-ux
See [ui-ux/taste.md](ui-ux/taste.md)
# architecture
See [architecture/taste.md](architecture/taste.md)
