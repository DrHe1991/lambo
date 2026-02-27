## Sprint Plan — Spend & Earn Implementation

> Based on `simulator/SYSTEM_DESIGN.md` (模拟器验证版).
> Sprint 1-5 已完成. Sprint 6+ 基于模拟器验证的新经济模型.

---

### What's Already Built

| Layer | Done |
| --- | --- |
| **DB Models** | User (name, handle, avatar, bio, trust_score, 4 sub-scores), Post, Comment, PostLike, CommentLike, Follow, Ledger, InteractionLog, RewardPool, PostReward, CommentReward, Challenge |
| **API Routes** | Users CRUD + follow/unfollow + trust + costs, Posts CRUD + like + comments + feed, Rewards settlement + discovery, Challenges L1 (AI) |
| **Frontend** | Login (dev mode), Feed, Following, Post creation, Chat, Profile, PostCard, Trust ring, Challenge modal, Rewards tab |

### Key Model Changes (Sprint 6+)

基于模拟器验证，以下参数需要更新:

| 参数 | 旧值 | 新值 | 原因 |
|------|------|------|------|
| 发帖成本 | 200 sat | **50 sat** | 降低创作门槛 |
| 点赞成本 | 10 sat | **20 sat** | 提高点赞价值 |
| 评论成本 | 50 sat | **20 sat** | 降低互动门槛 |
| 平台增发 | 300/DAU | **0** | 零补贴，用户付费驱动 |
| 收入分配 | T+7d 奖励池 | **80% 实时 + 20% 质量补贴** | 即时反馈 |

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

## Sprint 6 — 收入分配重构

> Goal: 实现 80% 直接分成 + 20% 平台收入池，取消平台增发

### 数据库

- [ ] 创建 `platform_revenue` 表:
  ```sql
  CREATE TABLE platform_revenue (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    like_revenue BIGINT DEFAULT 0,
    comment_revenue BIGINT DEFAULT 0,
    post_revenue BIGINT DEFAULT 0,
    boost_revenue BIGINT DEFAULT 0,
    total BIGINT DEFAULT 0,
    distributed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE UNIQUE INDEX idx_platform_revenue_date ON platform_revenue(date);
  ```
- [ ] Alembic migration

### 后端

- [ ] 新增 `LedgerService.spend_with_split()`:
  ```python
  async def spend_with_split(
      self, user_id: int, amount: int, author_id: int,
      action_type: ActionType, ref_type: RefType, ref_id: int
  ) -> tuple[int, int]:
      """支付并分成: 80% 给作者, 20% 进平台池"""
      author_share = int(amount * 0.80)
      platform_share = amount - author_share
      
      await self.spend(user_id, amount, action_type, ref_type, ref_id)
      await self.earn(author_id, author_share, ActionType.EARN_LIKE, ref_type, ref_id)
      await self._add_platform_revenue(platform_share, action_type)
      
      return author_share, platform_share
  ```

- [ ] 修改 `routes/posts.py`:
  - `like_post`: 改用 `spend_with_split(liker, 20 sat, author, LIKE)`
  - `create_comment`: 改用 `spend_with_split(commenter, 20 sat, post_author, COMMENT)`

- [ ] 修改成本参数 (对齐模拟器):
  ```python
  # config.py
  C_POST = 50      # 原 200
  C_LIKE = 20      # 原 10
  C_COMMENT = 20   # 原 50
  C_REPLY = 10     # 不变
  ```

- [ ] 修改 `discovery_service.py`:
  - 移除 `EMISSION_PER_DAU = 300`
  - 修改 `_calculate_pool()`: 只计算用户支付的费用，不加增发

### 前端

- [ ] 更新成本显示: 点赞 20 sat, 评论 20 sat, 发帖 50 sat

### 测试

- [ ] `test_s6_revenue_split.sh`:
  - 点赞后作者立即收到 16 sat (80%)
  - 平台池累计 4 sat (20%)
  - 无平台增发

**Deliverable**: 零补贴经济模型上线。创作者立即获得 80% 收入。

---

## Sprint 7 — Settlement Worker

> Goal: 独立进程处理每日质量补贴和 Cabal 检测

### 架构

使用 APScheduler 在独立进程中运行定时任务:

```
api/
├── app/              # 主 API (FastAPI)
└── worker/           # Settlement Worker
    ├── __init__.py
    ├── main.py       # APScheduler 入口
    ├── config.py     # 调度配置
    └── jobs/
        ├── quality_subsidy.py   # 每日质量补贴
        └── cabal_detection.py   # 每日 Cabal 检测
```

### 数据库

- [ ] 创建 `subsidy_record` 表:
  ```sql
  CREATE TABLE subsidy_record (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    post_id INT REFERENCES posts(id),
    amount BIGINT NOT NULL,
    quality_density FLOAT NOT NULL,
    reason VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```

### 后端

- [ ] 创建 `worker/main.py`:
  ```python
  from apscheduler.schedulers.asyncio import AsyncIOScheduler
  from worker.jobs import quality_subsidy, cabal_detection

  scheduler = AsyncIOScheduler()

  # 每日 UTC 00:00 质量补贴
  scheduler.add_job(quality_subsidy.run, 'cron', hour=0, minute=0)

  # 每日 UTC 01:00 Cabal 检测
  scheduler.add_job(cabal_detection.run, 'cron', hour=1, minute=0)
  ```

- [ ] 实现 `jobs/quality_subsidy.py`:
  - 获取前一日 `platform_revenue`
  - 查找「被低估的高质量内容」:
    - 点赞数 >= 2
    - 点赞排名 < 70 分位数
    - quality_density >= 0.35
    - 作者 risk_score < 100
    - 非 Cabal 成员
  - 按 quality_density 比例分配补贴
  - 标记 `platform_revenue.distributed = True`

- [ ] 添加 API endpoint `GET /admin/worker/status` (只读)

- [ ] 创建 `worker/Dockerfile`

- [ ] 更新 `docker-compose.yml`:
  ```yaml
  worker:
    build:
      context: ./api
      dockerfile: worker/Dockerfile
    depends_on:
      - db
      - redis
  ```

### 测试

- [ ] 手动触发 `POST /admin/jobs/quality-subsidy` (dev only)
- [ ] 验证补贴正确分配

**Deliverable**: Settlement Worker 独立运行，每日分配质量补贴。

---

## Sprint 8 — Trust 系统升级

> Goal: 对齐模拟器验证的 Trust 公式和等级阈值

### Trust 公式变更

旧公式:
```
TrustScore = 0.30×Creator + 0.25×Curator + 0.25×Juror + 0.20×(1000-Risk)
```

新公式 (模拟器验证):
```
TrustScore = Creator × 0.6 + Curator × 0.3 + Juror_bonus - Risk_penalty

Juror_bonus = max(0, (Juror - 300) × 0.1)
Risk_penalty:
  - risk <= 50:  risk × 0.5
  - risk <= 100: 25 + (risk - 50) × 2
  - risk > 100:  125 + (risk - 100) × 5  # 严重惩罚
```

### 等级阈值变更

| 等级 | 旧阈值 | 新阈值 |
|------|--------|--------|
| White | 0-399 | 0-150 |
| Green | 400-599 | 151-200 |
| Blue | 600-749 | 201-300 |
| Purple | 750-899 | 301-450 |
| Orange | 900+ | 451+ |

### 初始分数变更

| 维度 | 旧值 | 新值 |
|------|------|------|
| Creator | 500 | **150** |
| Curator | 500 | **150** |
| Juror | 500 | **300** |
| Risk | 0 | **30** |

### 后端

- [ ] 修改 `trust_service.py`:
  - 更新 `compute_trust_score()` 使用新公式
  - 更新 `trust_tier()` 使用新阈值
  - 移除 creator/curator 的 1000 上限 (无硬顶)

- [ ] 添加等级递减机制:
  ```python
  TIER_REWARD_MULTIPLIER = {
      'white': 1.0,
      'green': 0.7,
      'blue': 0.5,
      'purple': 0.3,
      'orange': 0.15,
  }
  
  async def update_creator(self, user_id, delta, reason=''):
      tier = trust_tier(user.trust_score)
      adjusted_delta = int(delta * TIER_REWARD_MULTIPLIER[tier])
      # 惩罚不递减，始终全额
      if delta < 0:
          adjusted_delta = delta
      ...
  ```

- [ ] 创建迁移脚本: 将现有用户分数从旧范围映射到新范围
  ```python
  # 保持相对排名
  new_creator = int(old_creator * 150 / 500)
  new_curator = int(old_curator * 150 / 500)
  new_juror = int(old_juror * 300 / 500)
  ```

- [ ] Alembic migration 更新默认值

### 前端

- [ ] 更新 `trustTheme.ts` 阈值

### 测试

- [ ] 新用户 Trust = 150×0.6 + 150×0.3 + 0 - 15 = 120 → White 等级
- [ ] 高 Risk (>100) 用户 Trust 大幅下降

**Deliverable**: 新 Trust 公式上线，符合模拟器验证的金字塔分布。

---

## Sprint 9 — 点赞权重完善

> Goal: 实现完整的 Like.weight 计算 (CE + 跨圈)

### 点赞权重公式

```
Like.weight = W_trust × N_novelty × S_source × CE_entropy × Cross_circle × Cabal_penalty
```

### 数据库

- [ ] 创建 `user_interaction_summary` 表:
  ```sql
  CREATE TABLE user_interaction_summary (
    user_id INT NOT NULL,
    target_user_id INT NOT NULL,
    total_count INT DEFAULT 0,
    last_30d_count INT DEFAULT 0,
    last_interaction_at TIMESTAMP,
    PRIMARY KEY (user_id, target_user_id)
  );
  ```

### 后端

- [ ] 修改 `discovery_service.py` 添加新因子:

  ```python
  # CE_entropy: 共识多样性
  CE_TABLE = {
      'cabal': 0.02,       # Cabal 互刷几乎无效
      'high_freq': 0.15,   # 高频好友
      'same_channel': 1.0, # 同频道
      'cross_channel': 5.0,# 跨频道
      'cross_region': 10.0,# 跨地区
  }
  
  def ce_entropy(liker_id: int, author_id: int) -> float:
      # Phase 1 简化: 只区分 cabal/high_freq/normal
      ...
  
  # Cross_circle: 跨圈点赞加成
  def cross_circle_mult(liker_id: int, author_id: int) -> float:
      if is_following(liker_id, author_id):
          return 1.0  # 圈内
      return 1.5      # 跨圈
  
  # Cabal_penalty: Cabal 成员惩罚
  def cabal_penalty(liker_id: int) -> float:
      if is_cabal_member(liker_id):
          return 0.3
      return 1.0
  ```

- [ ] 创建 `InteractionGraphService`:
  - `update_interaction(actor_id, target_id)`: 记录互动
  - `get_novelty(actor_id, target_id)`: 返回 N_novelty
  - `get_30d_count(actor_id, target_id)`: 返回近 30 天互动次数
  - 每日 job 更新 `last_30d_count`

### 测试

- [ ] 跨圈点赞权重 = 基础权重 × 1.5
- [ ] Cabal 成员点赞权重 = 基础权重 × 0.3

**Deliverable**: 点赞权重计算完整，跨圈互动被激励，互刷被惩罚。

---

## Sprint 10 — Cabal 检测

> Goal: 自动检测并惩罚互刷组织

### 检测逻辑

```python
# 触发条件:
# 1. 组内互动 / 组外互动 > 3
# 2. 平均组内互动 > 50 次/人
# 3. 成员平均 Risk > 80
```

### 数据库

- [ ] 创建 `cabal` 表:
  ```sql
  CREATE TABLE cabal (
    id SERIAL PRIMARY KEY,
    detected_at TIMESTAMP DEFAULT NOW(),
    member_count INT,
    avg_internal_ratio FLOAT,
    status VARCHAR(20) DEFAULT 'active'  -- active/resolved
  );
  ```

- [ ] 创建 `cabal_member` 表:
  ```sql
  CREATE TABLE cabal_member (
    id SERIAL PRIMARY KEY,
    cabal_id INT REFERENCES cabal(id),
    user_id INT REFERENCES users(id),
    is_primary BOOLEAN DEFAULT FALSE,  -- 主犯
    penalty_applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```

### 后端

- [ ] 创建 `CabalService`:
  ```python
  class CabalService:
      async def detect_potential_cabals(self) -> list[set[int]]:
          """聚类分析检测潜在 Cabal"""
          ...
      
      async def confirm_and_penalize(self, member_ids: set[int]):
          """确认 Cabal 并执行惩罚"""
          for uid in member_ids:
              # Risk +150~500
              await trust_svc.update_risk(uid, random.randint(150, 500))
              # Creator 扣除 500~1500
              await trust_svc.update_creator(uid, -random.randint(500, 1500))
              # 余额没收 30%~80%
              user = await db.get(User, uid)
              seizure = int(user.available_balance * random.uniform(0.3, 0.8))
              await ledger.spend(uid, seizure, ActionType.CABAL_PENALTY, ...)
          ...
      
      async def get_suspicion_level(self, user_id: int) -> float:
          """渐进式怀疑: 0.0 ~ 1.0"""
          internal_ratio = await self._get_internal_ratio(user_id)
          return min(1.0, internal_ratio / 5)
  ```

- [ ] 添加到 Settlement Worker:
  - 每日 01:00 运行 `cabal_detection.run()`
  - 记录检测结果到 `cabal` 表
  - 主犯需人工确认，从犯自动惩罚

### 测试

- [ ] 创建测试用 Cabal (5 人互刷)
- [ ] 验证检测和惩罚正确执行

**Deliverable**: Cabal 检测自动运行，互刷组织被惩罚。

---

## Sprint 11 — Boost 付费曝光

> Goal: 广告商可以付费提升曝光

### 数据库

- [ ] 添加字段到 `posts`:
  ```sql
  ALTER TABLE posts ADD COLUMN boost_amount BIGINT DEFAULT 0;
  ALTER TABLE posts ADD COLUMN boost_remaining FLOAT DEFAULT 0;
  ```

### 后端

- [ ] 添加 `POST /posts/{id}/boost`:
  ```python
  @router.post('/{id}/boost')
  async def boost_post(id: int, amount: int, user: User = Depends(get_current_user)):
      if amount < 1000:
          raise HTTPException(400, 'Minimum boost is 1000 sat')
      
      post = await db.get(Post, id)
      if post.author_id != user.id:
          raise HTTPException(403, 'Can only boost your own posts')
      
      # 扣款
      await ledger.spend(user.id, amount, ActionType.BOOST, RefType.POST, id)
      
      # 50% 进平台池 (用于质量补贴)
      # 50% 为平台运营收入
      pool_share = amount // 2
      await _add_platform_revenue(pool_share, 'boost')
      
      # 更新帖子
      post.boost_amount += amount
      post.boost_remaining += amount / 100  # 100 sat = 1 曝光点
      ...
  ```

- [ ] 修改 Feed 排序:
  ```python
  def get_feed_score(post: Post) -> float:
      base = post.discovery_score or 1.0
      boost_mult = min(5.0, 1.0 + post.boost_remaining)
      return base * boost_mult
  ```

- [ ] 添加到 Settlement Worker:
  - 每日 Boost 衰减 30%:
    ```python
    post.boost_remaining *= 0.7
    ```

### 前端

- [ ] Boost 按钮 (仅自己的帖子可见)
- [ ] 预算输入 (最低 1000 sat)
- [ ] 确认弹窗 (显示预期曝光天数)
- [ ] "已推广" 标识

### 测试

- [ ] Boost 扣款正确
- [ ] Feed 排序考虑 Boost
- [ ] 每日衰减 30%

**Deliverable**: Boost 功能上线，广告商可以付费提升曝光。

---

## Sprint 12 — Challenge Layer 2 (社区陪审)

> Goal: 对 L1 判决不服可上诉到社区陪审团

### 后端

- [ ] 添加 `POST /challenges/{id}/escalate`:
  - 费用: `F_L2 = 500 × K(trust)`
  - 仅 L1 结果后 24h 内可上诉
  - 创建陪审任务

- [ ] 创建 `jury_task` 表:
  ```sql
  CREATE TABLE jury_task (
    id SERIAL PRIMARY KEY,
    challenge_id INT REFERENCES challenges(id),
    juror_id INT REFERENCES users(id),
    vote VARCHAR(20),  -- guilty/not_guilty/abstain
    voted_at TIMESTAMP,
    reward_amount BIGINT DEFAULT 0
  );
  ```

- [ ] 实现陪审团选择:
  - 条件: Trust >= 600, 近 30 天无违规
  - 随机选择 5 人
  - 排除: 作者、举报者、关注作者的人

- [ ] 添加 `POST /challenges/{id}/vote`:
  - 仅被选中的陪审员可投票
  - 72h 投票窗口
  - 权重 = 陪审员 Trust 分数

- [ ] 实现 L2 结算:
  - 加权多数票决定结果
  - 罚款分配: 35% 举报者, 25% 陪审团, 40% 平台池
  - Trust 更新: 陪审正确 Juror +3, 错误 Juror -10

### 前端

- [ ] 上诉按钮 (L1 后显示)
- [ ] 陪审投票 UI
- [ ] 陪审任务通知

### 测试

- [ ] L2 上诉流程
- [ ] 陪审投票结算

**Deliverable**: L2 社区陪审上线，争议内容有社区裁决渠道。

---

## Summary Timeline

| Sprint | Duration | What Ships |
| --- | --- | --- |
| **S1** Ledger ✅ | Week 1 | Balance + transaction log |
| **S2** Paid Actions ✅ | Week 2 | Posts/comments/likes cost sat |
| **S3** Discovery + Rewards ✅ | Week 3-4 | T+7d settlement, earn from pool |
| **S4** TrustScore ✅ | Week 4-5 | Dynamic trust, color rings, fee scaling |
| **S5** Challenge L1 ✅ | Week 5-6 | AI moderation + fee settlement |
| **S6** 收入分配重构 | Week 7 | 80/20 分成，取消增发 |
| **S7** Settlement Worker | Week 8 | 独立 Worker + 质量补贴 |
| **S8** Trust 升级 | Week 9 | 新公式 + 等级递减 |
| **S9** 点赞权重 | Week 10 | CE + 跨圈 + Cabal 惩罚 |
| **S10** Cabal 检测 | Week 11 | 自动检测 + 惩罚 |
| **S11** Boost | Week 12 | 付费曝光 |
| **S12** Challenge L2 | Week 13 | 社区陪审 |

### Dependencies

```
S1-S5 ✅ (已完成)
     │
     ↓
S6 (收入分配) ──→ S7 (Worker) ──→ S11 (Boost)
                      │
                      ↓
               S8 (Trust) ──→ S9 (点赞权重) ──→ S10 (Cabal)
                                                    │
                                                    ↓
                                              S12 (L2 陪审)
```

S6 → S7 是关键路径。S8-S10 可与 S11 并行。

### Risk Mitigations

| Risk | Mitigation |
| --- | --- |
| 80/20 分成影响创作者积极性 | 模拟器验证: 优质创作者仍盈利 |
| Trust 迁移破坏老用户体验 | 保持相对排名，渐进式迁移 |
| Cabal 误判 | 先观察，人工确认后再自动惩罚 |
| Worker 宕机 | 健康检查 + 自动重启 + 补偿机制 |
| Boost 被滥用 | 每日上限 + 质量门槛 + 衰减机制 |
