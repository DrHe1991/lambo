# Release Notes

## v0.1.0 — First Android Test Build
**Date:** 2026-03-27

First tagged release for Android simulator testing. Covers the full stack from dynamic like pricing through media uploads and the redesigned post editor.

---

### Post Editor Redesign
- Restructured publish overlay layout — action buttons grouped in a bottom toolbar instead of scattered across the page
- "Write an article instead" moved to a subtle prompt below user info (mode decision), separated from content-level actions
- "Add photo" pinned in bottom toolbar with character count (`0/500` for posts, `0/2000` for Q&A)
- Q&A editor: publish button now says "Ask", blue-accented hover states on buttons, bounty section below toolbar
- Dashed border design preserved across all action buttons

### Media Upload Support
- Image attachments for posts (up to 9 photos), articles (inline), and chat messages
- Image compression before upload via `imageCompressor.ts`
- `ImageGrid` component for feed display, `ImageLightbox` for full-screen viewing
- Article editor inline image upload via TipTap

### Chat Improvements
- Fixed unread message count logic
- Persistent read status across sessions
- Enhanced chat session retrieval and message visibility
- Media attachments in chat messages

### Like System & Settlement
- Dynamic like pricing with cost curves
- 1-hour lock period for likes
- Settlement cron job (`POST /api/settlement/settle-likes`) runs every 60s
- Weight components for early supporter rewards

### Crypto & Payments
- Pay microservice (`pay/`) with TRON wallet support via `tronpy`
- HD wallet derivation for user deposit addresses
- Deposit monitoring (polls every 10s)
- USDT/sat exchange functionality via Binance integration
- Reserve rebalance (12h) and snapshot (5m) scheduling
- Deposit and withdraw UI screens

### UI & Design
- Dark mode default with warm-tinted neutrals
- Orange/amber brand accent throughout
- Light mode CSS refinements
- Consistent PostCard component styling
- Mobile-first layout (393x852 viewport)

### Infrastructure
- Docker Compose orchestration (postgres:5435, redis:6380, api:8003, ui:3003, pay:8005)
- Alembic migrations for both `api/` and `pay/` services
- Design context and project guide documentation (`CLAUDE.md`)

---

### Known Limitations
- No auth — user ID passed as query param (`?user_id=1`)
- Google OAuth + JWT planned but not implemented
- No push notifications yet
- Pay service deposit monitoring requires TRON node access
