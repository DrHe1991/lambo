## Sprint Plan — Spend & Earn Implementation

> Based on `simulator/SYSTEM_DESIGN.md` (模拟器验证版).
> Sprint 1-13 已完成. 举报仅用 L1 (LLM) 判决.

---

### 完成状态总览

| Sprint | 状态 | 测试 | 说明 |
|--------|------|------|------|
| S1 Ledger | ✅ 完成 | 16/16 | 余额 + 账单系统 |
| S2 Paid Actions | ✅ 完成 | 31/31 | 发帖/评论/点赞付费 |
| S3 Discovery | ✅ 完成 | 15/15 | 发现分 + T+7d 结算 |
| S4 TrustScore | ✅ 完成 | 21/21 | 多维信用分 + 动态费率 |
| S5 Challenge L1 | ✅ 完成 | (合并) | AI 自动仲裁 |
| S6 Revenue Split | ✅ 完成 | 15/15 | 80/20 分成，取消增发 |
| S7 Settlement Worker | ✅ 完成 | 5/5 | APScheduler + 质量补贴 |
| S8 Trust Formula | ✅ 完成 | 16/16 | 新公式 + 等级递减 |
| S9 Like Weight | ✅ 完成 | 8/8 | 完整点赞权重计算 |
| S10 Cabal Detection | ✅ 完成 | 11/11 | 自动检测 + 惩罚 |
| S11 Challenge L2 | ✅ 完成 | 11/11 | 社区陪审 + 投票 |
| S12 Boost | ✅ 完成 | 16/16 | 付费曝光 |
| S13 前端集成 | ✅ 完成 | - | 成本/Trust/Boost UI |
| **S15 AINFT** | 📋 计划中 | - | LLM 支付集成 |

**总测试**: 165/165 通过 ✅

---

## Sprint 1 — Ledger & Balance Foundation ✅

> Goal: every user has a sat balance. money in, money out, all recorded.

### 完成内容

- [x] `User.available_balance` 字段
- [x] `User.free_posts_remaining` 字段 (默认 1)
- [x] `Ledger` 模型 (完整账单记录)
- [x] `LedgerService` (spend/earn/get_balance/get_history)
- [x] `GET /users/{id}/balance` 端点
- [x] `GET /users/{id}/ledger` 端点
- [x] 用户初始 0 sat + 1 免费帖子

**测试**: `bash api/tests/test_s1_ledger.sh` — 16/16 ✅

---

## Sprint 2 — Paid Actions ✅

> Goal: every public action costs sat.

### 完成内容

- [x] `PostLike`, `CommentLike` 模型
- [x] 发帖: 50 sat (原 200), 首帖免费
- [x] 评论: 20 sat, 回复: 10 sat
- [x] 点赞: 20 sat (原 10)
- [x] 评论点赞: 5 sat
- [x] 不能给自己点赞
- [x] Unlike 不退款

**测试**: `bash api/tests/test_s2_paid_actions.sh` — 31/31 ✅

---

## Sprint 3 — Discovery Score & Rewards ✅

> Goal: T+7d settlement based on discovery score.

### 完成内容

- [x] `InteractionLog` 模型 (记录所有互动)
- [x] `RewardPool`, `PostReward`, `CommentReward` 模型
- [x] Discovery Score 计算器:
  - `W_trust`: 按等级 (0.5 ~ 6.0)
  - `N_novelty`: 互动次数衰减
  - `S_source`: 陌生人 1.0, 关注者 0.15
- [x] `POST /rewards/settle` 结算端点
- [x] `GET /rewards/posts/{id}/discovery` 详细分数
- [x] `GET /rewards/users/{id}/pending-rewards`
- [x] `GET /rewards/users/{id}/rewards`

**测试**: `bash api/tests/test_s3_discovery.sh` — 15/15 ✅

---

## Sprint 4 — TrustScore Multi-Dimension ✅

> Goal: TrustScore becomes real, dynamic, and visible.

### 完成内容

- [x] 4 维子分数: Creator, Curator, Juror, Risk
- [x] `TrustScoreService`:
  - `compute_trust_score()` 计算综合分
  - `update_creator/curator/juror/risk()` 更新子分数
- [x] 动态费率 `K(trust)`:
  - `K = clamp(1.4 - trust/1250, 0.6, 1.4)`
- [x] `GET /users/{id}/trust` 完整分数
- [x] `GET /users/{id}/costs` 动态费用

**测试**: `bash api/tests/test_s4_trust.sh` — 21/21 ✅

---

## Sprint 5 — Challenge L1 (AI) ✅

> Goal: AI-powered content moderation.

### 完成内容

- [x] `Challenge` 模型
- [x] `POST /challenges` 创建举报
- [x] AI 判决 (Groq → Anthropic → 规则兜底)
- [x] 违规处理: 删除内容, 罚款作者, 奖励举报者
- [x] Trust 更新

---

## Sprint 6 — Revenue Split ✅

> Goal: 80% 直接分成 + 20% 平台收入池，取消增发

### 完成内容

- [x] `PlatformRevenue` 模型 (按日记录收入)
- [x] `spend_with_split()` 实时分成
- [x] 点赞/评论 80% 给作者，20% 进平台池
- [x] 移除 `EMISSION_PER_DAU = 300`
- [x] 新成本参数:
  - 发帖 50 sat
  - 点赞 20 sat
  - 评论 20 sat
  - 回复 10 sat

**测试**: `bash api/tests/test_s6_revenue_split.sh` — 15/15 ✅

---

## Sprint 7 — Settlement Worker ✅

> Goal: 独立进程处理质量补贴

### 完成内容

- [x] `api/app/worker/settlement_worker.py` (APScheduler)
- [x] `SubsidyService` 质量补贴分配:
  - 识别被低估的高质量内容
  - 按 quality_density 分配补贴
  - 排除恶意用户
- [x] `docker-compose.yml` 添加 worker 服务
- [x] 调度任务:
  - 每周日 3:00 UTC 质量补贴
  - 每日 4:00 UTC Discovery 结算
  - 每周一 2:00 UTC Cabal 检测
- [x] `POST /rewards/subsidy` 手动触发 (测试用)

**测试**: `bash api/tests/test_s7_settlement_worker.sh` — 5/5 ✅

---

## Sprint 8 — Trust Formula Upgrade ✅

> Goal: 对齐模拟器验证的新 Trust 公式

### 完成内容

- [x] 新公式:
  ```
  Trust = Creator × 0.6 + Curator × 0.3 + Juror_bonus - Risk_penalty
  
  Juror_bonus = max(0, (Juror - 300) × 0.1)
  Risk_penalty:
    - risk <= 50:  risk × 0.5
    - risk <= 100: 25 + (risk - 50) × 2
    - risk > 100:  125 + (risk - 100) × 5
  ```
- [x] 新等级阈值:
  - White: 0-150
  - Green: 151-250
  - Blue: 251-400
  - Purple: 401-700
  - Orange: 701+
- [x] 新默认值:
  - Creator: 150
  - Curator: 150
  - Juror: 300
  - Risk: 30
- [x] 等级递减机制 (高等级获得奖励递减)
- [x] Creator/Curator 无上限

**测试**: `bash api/tests/test_s8_trust_formula.sh` — 16/16 ✅

---

## Sprint 9 — Like Weight ✅

> Goal: 完整的点赞权重计算

### 完成内容

- [x] `LikeWeightService` 计算完整权重:
  ```
  weight = W_trust × N_novelty × S_source × Cross_circle
  ```
- [x] `PostLike` 添加 `weight` 和 `weight_components` 字段
- [x] W_trust: 按点赞者 Trust 等级
- [x] N_novelty: 30 天互动次数衰减
- [x] S_source: 陌生人 1.0, 关注者 0.15
- [x] Cross_circle: 跨圈 1.5x

**测试**: `bash api/tests/test_s9_like_weight.sh` — 8/8 ✅

---

## Sprint 10 — Cabal Detection ✅

> Goal: 自动检测并惩罚互刷组织

### 完成内容

- [x] `CabalGroup`, `CabalMember` 模型
- [x] `CabalDetectionService`:
  - 构建交互图谱
  - 聚类分析找可疑群体
  - 检测条件: internal_ratio > 3, avg_internal > 50
- [x] 惩罚机制:
  - 主犯: Risk +500, Creator -1500, 没收 80%
  - 从犯: Risk +150, Creator -500, 没收 30%
  - 点赞权重 ×0.3 (30 天)
- [x] API 端点:
  - `POST /rewards/cabal/detect`
  - `POST /rewards/cabal/{id}/penalize`
  - `GET /rewards/cabal/user/{id}`
- [x] 集成到 settlement_worker

**测试**: `bash api/tests/test_s10_cabal.sh` — 11/11 ✅

---

## Sprint 11 — Challenge L2 (Community Jury) ✅

> Goal: 社区陪审团仲裁

### 完成内容

- [x] 增强 `Challenge` 模型:
  - `violation_type` (low_quality, spam, plagiarism, scam)
  - 投票字段 (votes_guilty, votes_not_guilty, jury_size)
  - 奖励分配字段 (reporter_reward, jury_reward, platform_share)
- [x] `JuryVote` 模型
- [x] `ChallengeService` 三层仲裁:
  - **L1 (100 sat)**: AI 自动判决
  - **L2 (500 sat)**: 社区 5 人陪审投票
  - **L3 (1500 sat)**: 委员会 (预留)
- [x] 罚款分配: 35% 举报者 + 25% 陪审团 + 40% 平台
- [x] Trust 更新:
  - 违规作者: Creator -50, Risk +30
  - 成功举报: Juror +10
  - 失败举报: Risk +5
  - 正确投票: Juror +15
  - 错误投票: Juror -10
- [x] API 端点:
  - `GET /challenges/fees`
  - `POST /challenges`
  - `GET /challenges/{id}`
  - `POST /challenges/{id}/vote`
  - `GET /challenges/jury/{user_id}/pending`

**测试**: `bash api/tests/test_s11_challenge.sh` — 11/11 ✅

---

## Sprint 12 — Boost 付费曝光 ✅

> Goal: 广告商可以付费提升曝光

### 完成内容

- [x] 添加字段到 `posts`:
  - `boost_amount BIGINT`
  - `boost_remaining FLOAT`
- [x] `POST /posts/{id}/boost`:
  - 最低 1000 sat
  - 50% 进平台池，50% 运营收入
  - 只有作者可以 boost 自己的帖子
- [x] `GET /posts/{id}/boost` 获取 boost 信息
- [x] Feed 排序考虑 Boost:
  ```python
  boost_mult = min(5.0, 1.0 + post.boost_remaining)
  ```
- [x] 每日衰减 30% (settlement_worker 每日 5AM UTC)
- [x] `POST /rewards/boost/decay` 手动触发衰减
- [x] 数据库迁移 `m3n4o5p6q7r8_add_boost_columns.py`

**测试**: `bash api/tests/test_s12_boost.sh` — 16/16 ✅

---

## Sprint 13 — 前端集成 ✅

> Goal: UI 对齐新后端功能

### 完成内容

- [x] 更新成本显示 (50/20/20/10 sat) — Trust 详情页动态费用
- [x] Trust 详情页更新 (新公式/阈值) — 四维分数展示
- [x] Boost 按钮 — `BoostModal` 完整实现

> Note: L2 陪审投票 UI 暂不实现，举报仅用 L1 (LLM) 判决

---

## Sprint 14 — 上诉机制 ⏸️ 暂缓

> Goal: L1 判决后可上诉到 L2
> 
> **暂缓原因**: 当前举报仅用 L1 (LLM) 判决，不实现 L2 陪审

### 预留内容 (未来可启用)

- [ ] `POST /challenges/{id}/escalate`
- [ ] 仅 L1 结果后 24h 内可上诉
- [ ] 陪审团资格筛选
- [ ] 加权投票
- [ ] 72h 投票超时处理

---

## Sprint 15 — AINFT LLM 支付集成 📋 计划中

> Goal: 通过 AINFT 平台支付举报判决的 LLM token 费用
> 
> **背景**: 举报功能使用 LLM (L1) 进行自动判决，会消耗 AI token。
> 计划集成 [AINFT](https://ainft.com/) 平台，用平台绑定的钱包支付推理费用。

### 关于 AINFT

AINFT 是基于 TRON 区块链的 AI + 区块链生态系统：
- **AI Agent 框架** — 支持多 Agent 系统
- **去中心化 AI 模型平台** — 模型训练和推理
- **钱包支付** — 通过 NFT 代币支付 AI 服务费用
- 官网: https://ainft.com/
- 白皮书: https://ainft.com/whitepaper/AINFT%20White%20Paper.pdf

### 预留内容 (未来实现)

- [ ] AINFT 钱包集成
- [ ] 举报时通过 AINFT 支付 LLM 推理费用
- [ ] 费用追踪和账单记录
- [ ] 用户 sat 余额 → AINFT 代币兑换 (可选)

---

## Summary Timeline

| Sprint | 状态 | 说明 |
|--------|------|------|
| **S1-S5** | ✅ 完成 | 基础经济系统 |
| **S6** | ✅ 完成 | 80/20 收入分配 |
| **S7** | ✅ 完成 | Settlement Worker |
| **S8** | ✅ 完成 | Trust 公式升级 |
| **S9** | ✅ 完成 | 点赞权重 |
| **S10** | ✅ 完成 | Cabal 检测 |
| **S11** | ✅ 完成 | 社区陪审 |
| **S12** | ✅ 完成 | Boost 付费曝光 |
| **S13** | ✅ 完成 | 前端集成 |
| **S14** | ⏸️ 暂缓 | 上诉机制 (依赖 L2 陪审) |
| **S15** | 📋 计划中 | AINFT LLM 支付集成 |

### 依赖关系

```
S1-S13 ✅ (后端 + 前端核心完成)
     │
     ├──→ S14 ⏸️ (上诉机制 - 暂缓，依赖 L2 陪审)
     │
     └──→ S15 📋 (AINFT LLM 支付 - 计划中)
```

---

## 运行测试

```bash
# 运行所有测试
cd /path/to/lambo
for t in api/tests/test_s*.sh; do
  echo "=== $t ==="
  bash "$t" 2>&1 | tail -5
  echo ""
done

# 当前: 165/165 通过 ✅
```

---

## 关键文件

| 文件 | 说明 |
|------|------|
| `api/app/services/trust_service.py` | Trust 公式 + 等级 |
| `api/app/services/discovery_service.py` | 发现分 + 质量推断 |
| `api/app/services/cabal_service.py` | Cabal 检测 |
| `api/app/services/challenge_service.py` | 举报/陪审系统 |
| `api/app/services/like_weight_service.py` | 点赞权重 |
| `api/app/services/subsidy_service.py` | 质量补贴 |
| `api/app/services/boost_service.py` | Boost 付费曝光 |
| `api/app/worker/settlement_worker.py` | 定时任务调度 |
| `simulator/SYSTEM_DESIGN.md` | 经济模型设计文档 |
