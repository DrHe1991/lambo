# BitLink — Project Guide for Claude Code

## What Is This?

BitLink is a non-custodial social tipping app. Users like posts; each like is a small USDC tip ($0.10 default) sent on Base from the user's own embedded wallet to the creator's wallet. The platform never holds user funds.

> Historical note: an earlier "liking = investing" model with platform-custodied SAT balances and revenue-pool settlement existed on `archive/like-to-earn-v1`. The codebase on `main` is being pivoted away from that model for App Store / Play Store compliance. See plan: `.cursor/plans/bitlink-apple-compliance-pivot_ef942d16.plan.md`.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, Zustand 5, TipTap 3 |
| Wallet / Auth | Privy embedded wallets (headless mode) + Delegated Actions; viem for chain reads/writes |
| API | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| On-chain | Base mainnet, USDC (Circle); Alchemy RPC |
| External funding (web only) | `bitlink.app/buy` — MoonPay (fiat onramp) + LiFi widget (TRON USDT → Base USDC bridge for Asia P2P users) |
| Database | PostgreSQL 16 (social data only — no balances) |
| Cache | Redis 7 (rate limits) |
| Mobile | Capacitor (Android first, app ID: `io.bitlink.app`); iOS deferred (see §Deferred Work) |
| Infra | Docker Compose (dev); Vercel + Railway/Fly + Neon (prod) |

## Project Structure

```
lambo/
├── api/                  # Backend (FastAPI) — social data only
│   ├── app/
│   │   ├── main.py       # Entry point
│   │   ├── config.py     # Settings (pydantic-settings)
│   │   ├── models/       # SQLAlchemy models
│   │   ├── routes/       # tips.py, wallet.py, posts, users, chat, drafts, media, auth, reports
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # privy_auth, chain_verifier, ai, ledger, …
│   │   └── auth/         # JWT, Privy verifier
│   └── alembic/          # DB migrations
├── ui/                   # React frontend (web + Capacitor Android)
│   ├── App.tsx           # Main app (state-based view routing, no React Router)
│   ├── api/client.ts     # All HTTP calls
│   ├── lib/
│   │   ├── privy.ts      # Privy provider config (headless)
│   │   └── chain.ts      # viem Base client + USDC helpers
│   ├── components/       # UI components (LikeConfirmModal = tip flow, DelegatedActionsConsent, …)
│   ├── stores/           # Zustand stores (user, post, chat, wallet)
│   └── hooks/            # Custom hooks (e.g., useChatWebSocket)
├── marketing/            # Static site for bitlink.app (landing + /buy with MoonPay+LiFi)
└── docker-compose.yml    # Orchestrates postgres + redis + minio + api + ui
```

> Removed in the compliance pivot: `pay/` microservice, `cron` settlement container, `simulator/`, `x-agent/`.

## Running the Project

```bash
docker-compose up                    # Full stack (postgres:5435, redis:6380, minio, api:8003, ui:3003)
cd ui && npm run dev                 # Frontend only (port 3003)
cd api && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload  # API only
```

Required env vars (see `ui/.env.example` and `api/.env.example`):
- `VITE_PRIVY_APP_ID` — from privy.io dashboard
- `VITE_BASE_RPC_URL` — Alchemy / public Base mainnet RPC
- `VITE_USDC_ADDRESS` — `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base USDC)
- `VITE_BUY_URL` — `https://bitlink.app/buy`
- `PRIVY_APP_ID`, `PRIVY_APP_SECRET` — backend JWT verification
- `BASE_RPC_URL` — backend on-chain tip verification

## Key Conventions

- **Auth** — Privy issues JWTs; backend verifies via `app.services.privy_auth.verify_privy_token`. All monetary and write endpoints use `Depends(get_current_user)`. Legacy `?user_id=` is gone.
- **No platform custody** — backend never holds private keys, never moves funds. `tips.py` only records `tx_hash` after on-chain verification via `chain_verifier`.
- **Frontend routing** — state-based views in App.tsx, NOT React Router.
- **API prefix** — all main API routes under `/api/...`.
- **DB** — single PostgreSQL DB; no `pay_*` tables.
- **Migrations** — Alembic in `api/alembic/`.
- **Like = Tip** — A like *is* a tip. There is no separate "tip" UI; pressing the like button opens `LikeConfirmModal` which sends $0.10 USDC by default.
- **Funding (Asia-friendly)** — In-app, the wallet shows USDC balance and a low-key "Manage funds on web" link to `bitlink.app/buy`. The /buy page hosts MoonPay (fiat) and LiFi widget (TRON USDT → Base USDC bridge). The mobile binary contains no onramp UI.
- **Chat** — WebSocket at `/api/chat/ws` (JWT-authed) with auto-reconnect and 30s keep-alive pings.
- **Geo** — Pre-funding: Play Store country availability (Asia 5: SG/HK/TW/MY/ID) + ToU exclusion of US/EU. API-level geo middleware deferred to post-funding.
- **Free posts** — Non-monetary `free_posts_remaining` counter is kept (Apple 3.1.5(v) compatible — no crypto reward).

## Important Files

- `api/app/config.py` — API settings
- `ui/lib/privy.ts` — Privy config (headless, Base chain enabled)
- `ui/lib/chain.ts` — viem client, USDC ABI, balance/transfer helpers
- `ui/api/client.ts` — All frontend API calls in one file
- `ui/types.ts` — Shared TypeScript types
- `docker-compose.yml` — Service definitions and ports

## Background Tasks

None. The cron container and pay deposit monitor are removed. All economic state lives on-chain; balances are read live from Base RPC.

## Forbidden Copy (Compliance)

`rg -i 'invest|earn|yield|stake|break.?even|position #|dividend|bonus' ui/` MUST return zero hits in user-facing strings. Replacements:

| Forbidden | Replacement |
|---|---|
| invest / investing / investor | support / supporter |
| earn / earnings / earned | receive / received |
| yield / APY / return | (delete) |
| break-even, your position #N | (delete) |
| stake / staking | tip |
| revenue pool, dividend | (delete) |
| welcome bonus, first exchange bonus | (delete) |

## Design Context

### Users
Asia-first crypto-aware Gen Z/Millennials, USDT P2P users (MY/ID/Chinese diaspora), creators. Mobile-first, casual-but-consequential — every tap moves real money on-chain.

### Brand Personality
**Bold. Rebellious. Real.** Anti-establishment social platform with swagger. Confidence of early Bitcoin culture + addictiveness of a great social feed. Not a bank, not a DeFi dashboard.

### Aesthetic Direction
- **Tone**: Bold, high-contrast, opinionated — between streetwear brand and premium social app
- **Theme**: Dark mode default (warm, tinted — not pure black), light mode supported
- **Colors**: Orange/amber brand accent. Warm-tinted neutrals. No cyan-on-dark or purple gradients
- **Typography**: Distinctive font pairing (NOT Inter/Roboto/Open Sans)
- **Anti-references**: Generic DeFi dashboards, childish gamification, minimalist-to-empty
- **Channel**: Cash App confidence, early Twitter energy, Medium editorial quality, crypto culture edge

### Design Principles
1. **Every tap has weight** — actions matter, clear feedback, honest microcopy
2. **Distinctive, not decorative** — no gratuitous gradients/glows
3. **Mobile-first, touch-native** — thumbs not mice, generous tap targets, no hover-dependence
4. **Warm rebellion** — dark mode = warm and inviting, not cold/techy
5. **Trust through consistency** — same action looks the same everywhere

---

## Deferred Work: iOS App Store Submission

**Status:** Documented but NOT implemented in the current refactor session. iOS submission is post-funding work (see plan §6.1). The codebase is being kept iOS-compatible (Capacitor, no Android-only APIs) so this can be picked up later without rewrites.

### Why deferred
- Apple Developer Program: $99/yr (acceptable) but submission needs a physical iOS device + Xcode on macOS for signing, plus a real review iteration loop. High wall-clock cost for a solo founder.
- Apple Guideline 3.1.5 cryptocurrency policies require lawyer-drafted Privacy Policy + ToU ($30-50K range from a SG/US crypto law firm), which is out of pre-funding budget.
- Sign in with Apple is required for any app that offers third-party social login (Privy provides Google/Apple/email). Adds 1-2 days plus Apple-side keys/certs.
- App Store External Link Account Entitlement (needed if MoonPay is linked from inside the iOS binary) is a separate Apple application with its own review.

### What needs to happen when we pick this up (Post-Funding §6.1, ~$5-10K + lawyer)

1. **Apple Developer enrollment** — individual or, preferably, the post-funding SG Pte Ltd / Delaware C-Corp account. DUNS number for company enrollment.
2. **Capacitor iOS build setup**
   - `npx cap add ios` and commit `ios/` folder.
   - Xcode project: bundle ID `io.bitlink.app`, deployment target iOS 14+.
   - Universal Links for Privy OAuth callback: configure `apple-app-site-association` on `bitlink.app`.
   - Privacy manifests (`PrivacyInfo.xcprivacy`) declaring tracking domains and required reason APIs.
3. **Sign in with Apple**
   - Add `Sign in with Apple` capability in Xcode.
   - Configure Privy dashboard with Apple OAuth (Apple Service ID, Team ID, Key ID, p8 private key).
   - LoginPage must surface the Apple button with required visual treatment (Apple HIG compliant).
4. **App Privacy declarations**
   - Privy SDK collects: device identifiers, email (if user uses email login), wallet address. Declare in App Store Connect.
   - viem / RPC calls: declare third-party domains (Alchemy, Base RPC).
5. **Age rating: 17+** — required for crypto wallet apps under 3.1.5.
6. **Reviewer demo account** — pre-fund a Privy email login with $5 USDC on Base for the App Store review team. Document in Reviewer Notes:
   - "This is a non-custodial wallet. Funds shown belong to the user, not BitLink."
   - "Likes are tips: pressing like sends $0.10 USDC on Base from the user's wallet to the creator's wallet."
   - "We never hold user funds. There is no in-app purchase of cryptocurrency."
7. **Avoid 3.1.5(v)** — verify in code that no in-app action grants USDC for completing tasks (no referral USDC, no daily login USDC, no posting USDC). The free post quota is a non-monetary counter.
8. **Avoid 3.1.1 (IAP)** — never offer USDC for sale inside the iOS binary. Funding link to `bitlink.app/buy` must be external (Safari) unless we obtain the External Link Account Entitlement.
9. **App Store description** — EN + zh-Hant. Lead with social tipping, not investing. Sample tagline: "Like = Tip. A social app where every tap supports a creator with $0.10 USDC."
10. **Lawyer-drafted Privacy Policy + ToU** ($30-50K) — covers crypto disclosures, jurisdiction (SG), data residency, age, prohibited regions.
11. **External Link Account Entitlement application** — if we want MoonPay button visible inside iOS app. Otherwise, in-app shows only "Open buy.bitlink.app" link that opens Safari.
12. **End-to-end test on physical iOS device** — login, delegated actions consent, balance read, tip flow, deep link back from Safari onramp.
13. **TestFlight soft launch** — 100 internal testers, then external (up to 10K).
14. **First App Store submission** — expect 1-2 rejection cycles. Each takes 24-72h.

### Things to do now to keep iOS unblocked
- Do NOT introduce Android-only Capacitor plugins without an iOS counterpart.
- Keep Privy provider configuration parameterizable per platform (different OAuth callback URLs for iOS Universal Links vs Android App Links).
- Keep `bitlink.app/buy` deep-link parameters platform-agnostic (`?wallet=0x...&return=...`).
- Avoid copy that mentions "earn", "invest", "stake", "yield", "bonus" anywhere in the app — Apple reviewers grep for these words. The copy audit (`rg` rule above) is enforced for both stores.

When ready to start iOS work, reactivate the deferred todos `p0_apple_prep` and `p0_test_submit`.
