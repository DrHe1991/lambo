## Sprint Plan — Spend & Earn Implementation

> Based on `RULES_TABLE_ZH.md` v3 (Spend & Earn).
> Each sprint = ~1 week. Total = 6 sprints (~6 weeks).

---

### What's Already Built

| Layer | Done |
| --- | --- |
| **DB Models** | User (name, handle, avatar, bio, trust_score), Post (content, type, status, likes_count, comments_count, bounty), Comment (content, parent_id, likes_count), Follow, ChatSession, ChatMember, Message |
| **API Routes** | Users CRUD + follow/unfollow, Posts CRUD + like (simple counter) + comments + feed, Chat sessions + messages |
| **Frontend** | Login (dev mode), Feed, Following, Post creation, Chat (1:1 + group), Profile, PostCard, Stores (user, post, chat) |

### What's NOT Built

- `available_balance` on User
- Ledger (transaction log)
- Like table (currently just counter++)
- Any spending on actions
- Reward pool + Discovery Score
- TrustScore sub-dimensions (Creator, Curator, Juror, Risk)
- Interaction tracking (for N_novelty)
- Challenge system
- Daily login rewards
- Boost system

---

## Sprint 1 — Ledger & Balance Foundation ✅

> Goal: every user has a sat balance. money in, money out, all recorded.

### Backend

- [x] Add `available_balance` column to `User` model (default 0)
- [x] Add `free_posts_remaining` column to `User` model (default 1)
- [x] Create `Ledger` model (id, user_id, amount, balance_after, action_type, ref_type, ref_id, created_at)
- [x] Create `LedgerService` with `spend()`, `earn()`, `get_balance()`, `get_history()`
- [x] Alembic migrations
- [x] Add `GET /users/{id}/balance` endpoint
- [x] Add `GET /users/{id}/ledger` endpoint
- [x] No signup bonus, no daily login — users start at 0 sat + 1 free post

### Frontend

- [x] Show balance in profile page and nav bar
- [x] Show transaction history page
- [x] Remove DailyRewardModal and all bonus-related UI

### Tests

- [x] 16/16 tests passing (`bash api/tests/test_s1_ledger.sh`)

**Deliverable**: Users start with 0 sat + 1 free post. Ledger tracks all sat movement.

---

## Sprint 2 — Paid Actions (Post / Comment / Like) ✅

> Goal: every public action costs sat. No more free posting.

### Backend

- [x] Create `PostLike` model (replace simple counter):
  Unique constraint on (post_id, user_id). Same for `CommentLike`.
- [x] Modify `create_post`: 200 sat (note), 300 sat (question), free first post
- [x] Modify `create_comment` / reply / answer: Comment 50, Reply 20, Answer 200 sat
- [x] Rewrite `like_post`: PostLike record + 10 sat, idempotent, unlike = no refund
- [x] Add `like_comment` / `unlike_comment` endpoints (5 sat)
- [x] Add `GET /posts/{id}?user_id=X` — proper `is_liked` on posts & comments
- [x] Cannot like own post/comment
- [x] Alembic migration for `post_likes`, `comment_likes`, `comments.cost_paid`

### Frontend

- [x] Like button toggles (like/unlike), shows cost "10sat"
- [x] Post detail loads real comments from API
- [x] QA detail loads real answers from API
- [x] Comment/reply submission with cost labels (50/20/200 sat)
- [x] Comment like toggle with cost label (5 sat)
- [x] Toast warning on insufficient balance
- [x] `is_liked` state synced with API

### Tests

- [x] 31/31 tests passing (`bash api/tests/test_s2_paid_actions.sh`)

**Deliverable**: All public actions cost sat (except 1st free post). Balance goes down with each action.

---

## Sprint 3 — Discovery Score & Reward Settlement ✅

> Goal: T+7d settlement. Good content earns from the pool.

### Backend

- [x] Create `InteractionLog` model (actor_id, target_user_id, interaction_type, created_at)
  - Log every like/comment/reply as an interaction between actor and content author
- [x] Create `RewardPool` model (settle_date, total_pool, total_distributed, status)
- [x] Create `PostReward` model (post_id, discovery_score, author_reward, comment_pool, status)
- [x] Create `CommentReward` model (comment_id, post_reward_id, discovery_score, reward_amount)
- [x] Implement Discovery Score calculator (W_trust × N_novelty × S_source):
  - W_trust: 5 tiers (White 0.5, Green 1.0, Blue 2.0, Purple 3.5, Orange 6.0)
  - N_novelty: interaction count decay (1.0, 0.6, 0.3, 0.12, 0.05)
  - S_source: stranger 1.0, follower 0.15
- [x] Implement settlement endpoint (`POST /rewards/settle`):
  - Finds unsettled posts older than T+Nd
  - Calculates pool = action fees + comment fees + like fees + emission (300 × DAU)
  - Distributes 80% to author, 20% to comment pool
  - Comment pool split by comment discovery scores
  - Idempotent (won't double-pay)
- [x] Add `GET /rewards/posts/{id}/discovery` — full score breakdown per liker
- [x] Add `GET /rewards/users/{id}/pending-rewards` — posts still accumulating
- [x] Add `GET /rewards/users/{id}/rewards` — settled reward history
- [x] Add `GET /rewards/pools` — list settlement pools
- [x] Alembic migration for all new tables

### Frontend

- [x] Discovery Score card on post detail and QA detail pages
- [x] Settlement status display (pending / settled + amount)
- [x] "Rewards" tab in profile → pending items + settled history + total earned
- [x] Reward ledger entries (`reward_post`, `reward_comment`) in transaction view

### Tests

- [x] 15/15 tests passing (`bash api/tests/test_s3_discovery.sh`)

**Deliverable**: Posts earn rewards at T+7d based on Discovery Score. Users can see what they earned and why.

---

## Sprint 4 — TrustScore Multi-Dimension ✅

> Goal: TrustScore becomes real, dynamic, and visible.

### Backend

- [x] Add 4 sub-score columns to `User`:
  ```
  creator_score (default 500)
  curator_score (default 500)
  juror_score  (default 500)
  risk_score   (default 0)
  ```
- [x] Implement `TrustScoreService`:
  - `recalculate(user_id)` → `0.30×Creator + 0.25×Curator + 0.25×Juror + 0.20×(1000-Risk)`
  - `update_creator(user_id, delta, reason)`
  - `update_curator(user_id, delta, reason)`
  - etc.
- [x] Hook TrustScore updates into existing flows:
  - Post settled without violation → `Creator +3` (and +5~+15 for top 10%)
  - Zero engagement post → `Creator -1`
  - User liked a post that got rewarded → `Curator +1`
- [x] Implement dynamic fees `K(trust)`:
  - `K = clamp(1.4 - trust/1250, 0.6, 1.4)`
  - Applied to all paid actions (post, question, comment, reply, answer, like, comment-like)
- [x] Add `GET /users/{id}/trust` endpoint (full breakdown)
- [x] Add `GET /users/{id}/costs` endpoint (dynamic costs for all actions)
- [x] Alembic migration for 4 new columns

### Frontend

- [x] Show TrustScore color ring on profile avatar (White/Green/Blue/Purple/Orange)
- [x] Trust detail page: big ring, 4 sub-score bars, fee multiplier, dynamic cost grid
- [x] Publish overlay shows dynamic cost (adjusted by trust)
- [x] Trust menu item in profile with tier + multiplier preview
- [x] `trustTheme.ts` updated to 0-1000 scale with stroke color + badge bg helpers

### Tests

- [x] 22/22 tests passing (`bash api/tests/test_s4_trust.sh`)

**Deliverable**: TrustScore is live, visible, and affects costs. Good behavior = cheaper actions.

---

## Sprint 5 — Challenge Layer 1 (AI) ✅

> Goal: anyone can challenge content. AI judges. Winner/loser pays.

### Backend

- [x] Create `Challenge` model:
  ```
  id, content_type (post/comment), content_id,
  challenger_id, author_id,
  layer (1/2/3), status (pending/guilty/not_guilty),
  fee_paid, fine_amount,
  ai_verdict, ai_reason, ai_confidence,
  created_at, resolved_at
  ```
- [x] Create `POST /challenges` endpoint:
  - Validate: content exists, within 7d window, not already challenged
  - Calculate fee: `F_L1 = 100 × K(trust)`
  - Spend fee from challenger
  - AI gets full author profile, post history, trust score, and violation history
  - Supports Groq (fast) → Anthropic → rule-based fallback
  - Store verdict
- [x] Implement settlement on guilty:
  - Content → status = deleted
  - Author fine: `C_action × P` (P=1.0 default) from balance
  - Challenger: refund fee + 35% of fine
  - TrustScore: author Creator -30, Risk +20; challenger Creator +5
- [x] Implement settlement on not_guilty:
  - Challenger: fee lost
  - Author: gets 20% of challenger's fee + Creator +3
- [x] Add `GET /challenges?content_id=X` — view challenge status
- [x] Add `GET /challenges?user_id=X` — user's challenge history
- [x] Add `GET /challenges/{id}` — single challenge details
- [x] Alembic migration for challenges table

### Frontend

- [x] ChallengeModal wired to real `POST /challenges` API
- [x] Dynamic challenge fee from user's K(trust) multiplier
- [x] AI reasoning + confidence displayed in result
- [x] Fee refund + reward breakdown shown on guilty
- [x] Balance + posts auto-refresh after challenge

### Tests

- [x] Rule-based fallback: normal content → not_guilty
- [x] Rule-based fallback: spam keywords → guilty
- [x] Post deleted on guilty, fee refunded to challenger
- [x] Author fined, trust scores updated

**Deliverable**: Users can challenge content. AI judges instantly. Fees settle automatically.

---

## Sprint 6 — Polish + Boost + Challenge Layer 2

> Goal: round out the MVP. Boost for visibility. Community jury for disputed cases.

### Backend

- [ ] Implement Challenge Layer 2 (escalation from L1):
  - `POST /challenges/{id}/escalate` — pay `F_L2 = 500 × K(trust)`
  - Simple jury: pick 5 eligible users (TrustScore ≥ 600)
  - `POST /challenges/{id}/vote` — jury votes guilty/not_guilty
  - Weighted majority → final verdict
  - Settlement same logic as L1 but with jury reward split
- [ ] Implement Boost:
  - Add `boost_budget` column to Post
  - `POST /posts/{id}/boost` — set budget, deduct from balance
  - Feed ranking: boost score influences position
  - Boost does NOT affect Discovery Score
  - 30% of boost revenue → reward pool
- [ ] Implement Spam Index `SI` (simple v1):
  - Track challenge success rate in last 24h
  - `M = 1 + 3×SI` applied to all costs
- [ ] Platform daily emission job:
  - Count DAU, add `300 × DAU` to reward pool

### Frontend

- [ ] Boost button on own posts → budget input → confirmation
- [ ] Show "Boosted" indicator on boosted posts
- [ ] Jury voting UI (for eligible users)
- [ ] Challenge escalation UI ("Appeal to community jury — costs X sat")
- [ ] Notification system for challenge updates, rewards, jury duty

**Deliverable**: Full MVP economic loop is live. Spend, earn, challenge, boost.

---

## Summary Timeline

| Sprint | Duration | What Ships |
| --- | --- | --- |
| **S1** Ledger | Week 1 | Balance + transaction log |
| **S2** Paid Actions | Week 2 | Posts/comments/likes cost sat |
| **S3** Discovery + Rewards | Week 3–4 | T+7d settlement, earn from pool |
| **S4** TrustScore | Week 4–5 | Dynamic trust, color rings, fee scaling |
| **S5** Challenge L1 | Week 5–6 | AI moderation + fee settlement |
| **S6** Polish + Boost + L2 | Week 6–7 | Boost, jury, spam index |

### Dependencies

```
S1 (Ledger) ──→ S2 (Paid Actions) ──→ S3 (Rewards)
                                          │
S4 (TrustScore) ←─────────────────────────┘
     │
     ↓
S5 (Challenge L1) ──→ S6 (L2 + Boost)
```

S1 → S2 → S3 is the critical path. S4 can start in parallel with late S3.

### Risk Mitigations

| Risk | Mitigation |
| --- | --- |
| Users run out of sat quickly | Initial 2000 sat + 100/day login. Adjust if retention drops. |
| Discovery Score gaming | N_novelty + S_source make farming very expensive. Monitor and tune. |
| AI moderation quality | Start conservative (high bar for guilty). L2 jury is the safety net. |
| Settlement job complexity | Start with daily batch. Move to hourly if needed. |
| Fee numbers too high/low | All costs are config values. A/B test with cohorts. |
