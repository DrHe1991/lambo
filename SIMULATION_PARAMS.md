# BitLink 经济系统参数手册 (Simulation Parameters)

本文档定义了 BitLink 平台经济系统的所有数值参数，供模拟器使用。

---

## 1. 全局常量

| 参数 | 符号 | 默认值 | 说明 |
| --- | --- | --- | --- |
| 平台每日排放系数 | `DAILY_EMISSION_PER_DAU` | 300 sat | 每活跃用户每日的平台补贴 |
| 奖励结算周期 | `REWARD_SETTLEMENT_DAYS` | 7 | 内容创建后第 7 天结算奖励 |
| Challenge 窗口 | `CHALLENGE_WINDOW_DAYS` | 7 | 内容创建后 7 天内可被 Challenge |
| 作者奖励分成 | `AUTHOR_REWARD_RATIO` | 0.80 | 帖子奖励中作者获得的比例 |
| 评论池分成 | `COMMENT_POOL_RATIO` | 0.20 | 帖子奖励中分给评论者的比例 |
| Boost 注入奖励池比例 | `BOOST_TO_POOL_RATIO` | 0.30 | Boost 收入中反哺创作者的比例 |
| 原创对赌 Discovery 加成 | `HUMAN_PLEDGE_BONUS` | 1.20 | 勾选"原创/非AI"后 Discovery Score 乘数 |
| 原创对赌惩罚倍数 | `HUMAN_PLEDGE_PENALTY_MULT` | 2.00 | 违约时罚款和信誉扣减的乘数 |

---

## 2. 垃圾压力指数与动态费率

### 2.1 垃圾压力指数 (Spam Index, SI)

```python
SI = clamp(
    0.2 * challenge_violation_rate +
    0.2 * new_account_post_ratio +
    0.2 * duplicate_content_rate +
    0.2 * negative_feedback_rate +
    0.2 * anomaly_cluster_score,
    0, 1
)
```

| 参数 | 范围 | 说明 |
| --- | --- | --- |
| `SI` | [0, 1] | 0 = 社区干净，1 = 垃圾攻击高峰 |

### 2.2 动态倍率 M(SI)

```python
M = 1 + 3 * SI
```

| SI 值 | M 倍率 | 场景 |
| --- | --- | --- |
| 0.0 | 1.0 | 正常状态 |
| 0.5 | 2.5 | 中度垃圾压力 |
| 1.0 | 4.0 | 极端垃圾攻击 |

### 2.3 信誉折扣 K(TrustScore)

```python
K = clamp(1.4 - TrustScore / 1250, 0.6, 1.4)
```

| TrustScore | K 系数 | 费用影响 |
| --- | --- | --- |
| 1000 (满分) | 0.60 | 费用打 6 折 |
| 750 (Purple) | 0.80 | 费用打 8 折 |
| 550 (新用户) | 0.96 | 接近基准 |
| 200 (低信誉) | 1.24 | 费用上浮 24% |
| 0 (最低) | 1.40 | 费用上浮 40% |

---

## 3. 行为花费表

> **实际费用 = Base × M(SI) × K(TrustScore)**

### 3.1 内容行为

| 行为 | 代号 | 基础花费 (sat) | 进入奖励池 | 可被 Challenge |
| --- | --- | --- | --- | --- |
| 发帖 `note` | `C_POST` | 200 | ✅ | ✅ |
| 发提问 `question` | `C_QUESTION` | 300 | ✅ | ✅ |
| 回答 `answer` | `C_ANSWER` | 200 | ✅ | ✅ |
| 评论 `comment` | `C_COMMENT` | 50 | ✅ | ✅ |
| 回复（对评论） | `C_REPLY` | 20 | ✅ | ✅ |
| 点赞帖子 | `C_LIKE` | 10 | ✅ | ❌ |
| 点赞评论 | `C_COMMENT_LIKE` | 5 | ✅ | ❌ |

### 3.2 Challenge 费用

| 层级 | 代号 | 基础费用 (sat) |
| --- | --- | --- |
| Layer 1: AI 初审 | `F_L1` | 100 |
| Layer 2: 社区陪审 | `F_L2` | 500 |
| Layer 3: 委员会终审 | `F_L3` | 1500 |

### 3.3 高质沙龙费用 (Phase 3)

| 行为 | 代号 | 默认值 | 说明 |
| --- | --- | --- | --- |
| 入场费 | `C_SALON_ENTRY` | 由创建者设定 (min 100 sat) | 50% 进沙龙池，50% 给沙龙主 |
| 沉默税 (每日) | `C_SILENCE_TAX` | 10 sat | 进入沙龙当日奖励池 |

---

## 4. 信誉系统参数

### 4.1 四维子分

| 维度 | 符号 | 范围 | 新用户初始值 |
| --- | --- | --- | --- |
| 创作者分 | `CreatorScore` | 0–1000 | 500 |
| 策展人分 | `CuratorScore` | 0–1000 | 500 |
| 陪审员分 | `JurorScore` | 0–1000 | 500 |
| 风险分 | `RiskScore` | 0–1000 | 0 |

### 4.2 综合信任分计算

```python
TrustScore = (
    0.30 * CreatorScore +
    0.25 * CuratorScore +
    0.25 * JurorScore +
    0.20 * (1000 - RiskScore)
)
```

**新用户初始 TrustScore** = 0.30×500 + 0.25×500 + 0.25×500 + 0.20×1000 = **550**

### 4.3 信誉等级与颜色

| 等级 | TrustScore 范围 | 颜色 | UI 表现 |
| --- | --- | --- | --- |
| White | 0–399 | 白色 | 头像白环 |
| Green | 400–599 | 绿色 | 头像绿环 |
| Blue | 600–749 | 蓝色 | 头像蓝环 |
| Purple | 750–899 | 紫色 | 头像紫环 |
| Orange | 900–1000 | 橙色 | 头像橙环 + 卡片高亮 |

### 4.4 信誉变化事件表

| 事件 | 影响维度 | 变化值 | 条件 |
| --- | --- | --- | --- |
| 帖子 7d 结算无违规 | CreatorScore | +2 ~ +5 | 基础奖励 |
| 帖子 Discovery 进 Top 10% | CreatorScore | +5 ~ +15 | 高质量内容 |
| 帖子 Discovery 进 Top 1% | CreatorScore | +15 ~ +30 | 爆款内容 |
| 内容被 Challenge 违规成立 | CreatorScore | -20 ~ -80 | 按严重度 |
| 内容被 Challenge 但不违规 | CreatorScore | +3 ~ +10 | 无辜被诉补偿 |
| 你点赞的内容被判违规 | CuratorScore | -1 ~ -5 | 眼光差惩罚 |
| 你点赞的内容获得 Top 10% | CuratorScore | +0.5 ~ +2 | 伯乐奖励 |
| 你点赞的内容获得 Top 1% | CuratorScore | +2 ~ +5 | 顶级伯乐 |
| 你的评论进帖子 Top 3 | CuratorScore | +2 ~ +5 | 优质评论 |
| 陪审投票与最终裁决一致 | JurorScore | +3 ~ +10 | 正确判断 |
| 陪审投票与裁决相反 | JurorScore | -3 ~ -10 | 错误判断 |
| 陪审缺席 | JurorScore | -20 | 不履职 |
| 上层推翻你所在的下层多数 | JurorScore | -15 ~ -50 | 集体错判 |
| 异常资金行为 | RiskScore | +10 ~ +200 | 风控触发 |
| 被判定为刷分节点 | RiskScore | +100 ~ +500 | 养号集团 |
| 关联账号被判刷分 | RiskScore | +20 ~ +100 | 连带风险 |

### 4.5 信誉衰减（时间因子）

```python
# 长期不活跃会导致信誉缓慢衰减
if days_since_last_activity > 30:
    CreatorScore *= 0.995 ** (days_since_last_activity - 30)
    CuratorScore *= 0.995 ** (days_since_last_activity - 30)
    JurorScore *= 0.995 ** (days_since_last_activity - 30)
```

---

## 5. Discovery Score 计算

### 5.1 核心公式

```python
like_weight = W_trust × N_novelty × S_source × CE_entropy
post_discovery_score = sum(like_weight for each like)
```

### 5.2 W_trust (信誉权重)

| 点赞者 TrustScore | 等级 | W_trust |
| --- | --- | --- |
| 0–399 | White | 0.5 |
| 400–599 | Green | 1.0 |
| 600–749 | Blue | 2.0 |
| 750–899 | Purple | 3.5 |
| 900–1000 | Orange | 6.0 |

### 5.3 N_novelty (新鲜度衰减)

| 过去 30 天交互次数 | N_novelty |
| --- | --- |
| 0 (首次) | 1.00 |
| 1–3 次 | 0.60 |
| 4–10 次 | 0.30 |
| 11–30 次 | 0.12 |
| 30+ 次 | 0.05 |

### 5.4 S_source (来源因子)

| 关系 | S_source |
| --- | --- |
| 陌生人 (未关注) | 1.00 |
| 粉丝 (已关注) | 0.15 |

### 5.5 CE_entropy (共识熵：反共谋)

```python
# 计算点赞者与作者的社交距离
co_following_ratio = len(common_followings) / max(len(liker_followings), 1)
mutual_like_frequency = get_mutual_like_count(liker, author, days=30)

if mutual_like_frequency > 10 or co_following_ratio > 0.5:
    CE = 0.1  # 回声室 / 养号集团
elif mutual_like_frequency > 3 or co_following_ratio > 0.2:
    CE = 0.5  # 轻度关联
elif is_same_primary_channel(liker, author):
    CE = 1.0  # 同一兴趣圈
else:
    CE = 5.0  # 跨圈层高熵共识
    if is_different_language_region(liker, author):
        CE = 10.0  # 跨语言/地区的极高熵
```

| 场景 | CE 值 | 说明 |
| --- | --- | --- |
| 养号集团互刷 | 0.1 | 几乎无效 |
| 频繁互动的好友 | 0.2 | 大幅削弱 |
| 同频道用户 | 1.0 | 基准 |
| 跨频道陌生人 | 5.0 | 高价值 |
| 跨语言/地区 | 10.0 | 极高价值 |

### 5.6 Scout Score (伯乐值)

```python
# 计算点赞时帖子的当前 Discovery Score
post_score_at_like_time = get_post_score_at_time(post, like_time)
total_likes_at_time = get_total_likes_at_time(post, like_time)

# 早期发现者获得杠杆
if total_likes_at_time <= 3:
    scout_multiplier = 5.0  # 前 3 个点赞
elif total_likes_at_time <= 10:
    scout_multiplier = 3.0  # 前 10 个点赞
elif total_likes_at_time <= 30:
    scout_multiplier = 1.5  # 前 30 个点赞
else:
    scout_multiplier = 1.0  # 正常

# 更新伯乐值（在帖子结算时）
if post_final_rank <= top_1_percent:
    liker.scout_score += 10 * scout_multiplier
elif post_final_rank <= top_10_percent:
    liker.scout_score += 3 * scout_multiplier
```

### 5.7 组合算例

| 场景 | W | N | S | CE | Scout | **总权重** |
| --- | --- | --- | --- | --- | --- | --- |
| Orange 跨圈陌生人首次（早期） | 6.0 | 1.00 | 1.00 | 5.0 | 5.0 | **150.0** |
| Orange 跨圈陌生人首次（晚期） | 6.0 | 1.00 | 1.00 | 5.0 | 1.0 | **30.0** |
| Blue 陌生人首次 | 2.0 | 1.00 | 1.00 | 1.0 | 1.0 | **2.0** |
| Green 熟人（交互 5 次） | 1.0 | 0.30 | 1.00 | 0.5 | 1.0 | **0.15** |
| Orange 粉丝（交互 20 次） | 6.0 | 0.12 | 0.15 | 0.2 | 1.0 | **0.022** |
| White 养号集团互刷 | 0.5 | 0.05 | 0.15 | 0.1 | 1.0 | **0.0004** |

> **关键结论**：1 个 Orange 跨圈早期伯乐的赞 = 375,000 个养号集团互刷的赞。

---

## 6. 奖励分配

### 6.1 日奖励池计算

```python
daily_pool = (
    sum(all_action_costs) +           # 行为花费
    DAILY_EMISSION_PER_DAU * DAU +    # 平台排放
    sum(violation_penalties) +         # 违规罚款
    sum(boost_revenue) * BOOST_TO_POOL_RATIO  # Boost 分成
)
```

### 6.2 帖子奖励计算

```python
# 结算当日所有满 7 天的帖子
total_discovery_score = sum(post.discovery_score for post in settling_posts)

for post in settling_posts:
    post_reward = (post.discovery_score / total_discovery_score) * daily_pool
    
    author_reward = post_reward * AUTHOR_REWARD_RATIO  # 80%
    comment_pool = post_reward * COMMENT_POOL_RATIO    # 20%
    
    # 如果有原创对赌
    if post.human_pledge:
        author_reward *= HUMAN_PLEDGE_BONUS  # ×1.2
    
    post.author.balance += author_reward
```

### 6.3 评论奖励计算

```python
for post in settling_posts:
    comment_pool = post_reward * COMMENT_POOL_RATIO
    
    total_comment_score = sum(c.discovery_score for c in post.comments)
    
    if total_comment_score > 0:
        for comment in post.comments:
            comment_reward = (comment.discovery_score / total_comment_score) * comment_pool
            comment.author.balance += comment_reward
    else:
        # 无评论或无点赞评论，全部归作者
        post.author.balance += comment_pool
```

---

## 7. Challenge 结算

### 7.1 违规成立 (GUILTY)

| 角色 | 经济结果 | 信誉结果 |
| --- | --- | --- |
| **内容作者** | 已花费打水漂 + 额外罚款 `C_action × P` | CreatorScore -20 ~ -80 |
| **挑战者** | 退还 challenge 费用 + 罚款的 35% | CreatorScore +3 ~ +10 |
| **陪审多数（正确方）** | 分享罚款的 25% | JurorScore +3 ~ +10 |
| **奖励池** | 获得罚款的 40% | - |
| **点赞者** | 无经济惩罚 | CuratorScore -1 ~ -5 |

**罚款倍数 P**（按严重度）：

| 违规类型 | P 值 |
| --- | --- |
| 低质量/灌水 | 0.5 |
| 垃圾广告 | 1.0 |
| 抄袭/AI 伪造 | 1.5 |
| 诈骗/钓鱼 | 2.0 |

**原创对赌违规**：P 值翻倍，信誉扣减翻倍。

### 7.2 不违规 (NOT_GUILTY)

| 角色 | 经济结果 | 信誉结果 |
| --- | --- | --- |
| **内容作者** | 奖励正常发放 + 败诉方费用的 20% | CreatorScore +3 ~ +10 |
| **败诉挑战者** | 费用全部损失 | CuratorScore -5 ~ -15 |
| **陪审多数（正确方）** | 分享败诉方费用的 30% | JurorScore +3 ~ +10 |
| **平台/池** | 获得败诉方费用的 50% | - |

### 7.3 上诉推翻

| 角色 | 经济结果 | 信誉结果 |
| --- | --- | --- |
| **胜诉升级方** | 退还该层费用 | +5 ~ +15 |
| **败诉升级方** | 费用全部损失 | -10 ~ -30 |
| **被推翻层的多数陪审** | - | JurorScore -15 ~ -50 |

---

## 8. 社交资产度量

### 8.1 影响力点数 (IP) 权重

| 粉丝等级 | TrustScore 范围 | IP 贡献 |
| --- | --- | --- |
| White | 0–399 | 1 |
| Green | 400–599 | 10 |
| Blue | 600–749 | 50 |
| Purple | 750–899 | 200 |
| Orange | 900–1000 | 1000 |

### 8.2 影响力广度 (Influence Breadth)

```python
influence_breadth = sum(IP(follower) for follower in user.followers)
breadth_percentile = get_percentile_rank(influence_breadth, all_users)
```

### 8.3 影响力深度 (Influence Depth / Purity)

```python
influence_depth = influence_breadth / max(len(user.followers), 1)
depth_percentile = get_percentile_rank(influence_depth, all_users)
```

### 8.4 深度等级判定

| Depth 值 | 等级 | 说明 |
| --- | --- | --- |
| < 2.0 | Diluted | 大量低质粉丝/僵尸粉 |
| 2.0 – 20.0 | Active | 正常真实用户 |
| 21.0 – 100.0 | Elite | 高质量粉丝群 |
| > 100.0 | Pure Gold | 顶级信誉密度 |

---

## 9. 提现风控

| 条件 | 单日额度 (sat) | 延迟 |
| --- | --- | --- |
| 新账号 (< 7 天) | 50,000 | 24–72h |
| RiskScore > 300 | 50,000 | 24–72h |
| TrustScore 400–699 | 300,000 | 6–24h |
| TrustScore ≥ 700 | 2,000,000 | 0–6h |

---

## 10. 高质沙龙经济学 (Phase 3)

### 10.1 沙龙池日结算

```python
daily_salon_pool = sum(silence_tax for member in salon.members)

# 计算每个成员的贡献分
for member in salon.members:
    contribution_score = sum(
        message.likes * get_liker_weight(liker)
        for message in member.today_messages
    )

# 按贡献分配
total_contribution = sum(m.contribution_score for m in salon.members)
for member in salon.members:
    if total_contribution > 0:
        member_reward = (member.contribution_score / total_contribution) * daily_salon_pool
        member.balance += member_reward
```

### 10.2 白嫖惩罚

```python
# 沉默税自动扣除
for member in salon.members:
    if member.balance >= C_SILENCE_TAX:
        member.balance -= C_SILENCE_TAX
    else:
        # 余额不足，踢出沙龙
        salon.remove_member(member)
```

---

## 11. 连带损毁机制 (Cabal Slashing)

### 11.1 刷分节点判定

```python
def is_cabal_node(user):
    # 指标 1：单向点赞比例过高
    given_likes = count_likes_given(user, days=30)
    received_likes_from_same = count_likes_from_same_users(user, days=30)
    mutual_ratio = received_likes_from_same / max(given_likes, 1)
    
    # 指标 2：社交图谱高度重叠
    co_following_density = calculate_co_following_density(user)
    
    # 指标 3：收入/支出异常
    income_expense_ratio = user.total_income / max(user.total_expense, 1)
    
    return (
        mutual_ratio > 0.7 or
        co_following_density > 0.6 or
        (income_expense_ratio > 5.0 and user.account_age < 30)
    )
```

### 11.2 关联账号惩罚

```python
def slash_cabal(primary_node):
    # 主节点
    primary_node.risk_score += 300
    primary_node.trust_score = recalculate_trust(primary_node)
    
    # 关联账号（长期单向点赞）
    associates = find_cabal_associates(primary_node)
    for associate in associates:
        association_strength = calculate_association(associate, primary_node)
        associate.risk_score += int(100 * association_strength)
        associate.trust_score = recalculate_trust(associate)
```

---

## 12. 模拟器用户原型

### 12.1 用户类型定义

| 类型 | 代号 | 行为特征 | 占比 |
| --- | --- | --- | --- |
| 精英创作者 | `ELITE_CREATOR` | 高质量原创，跨圈传播，低频发帖 | 2% |
| 活跃创作者 | `ACTIVE_CREATOR` | 中等质量，定期发帖 | 10% |
| 策展人 | `CURATOR` | 少发帖，多点赞，眼光好 | 15% |
| 普通用户 | `NORMAL` | 偶尔发帖，随便点赞 | 50% |
| 潜水者 | `LURKER` | 很少互动，主要浏览 | 15% |
| 垃圾账号 | `SPAMMER` | 发垃圾广告，被 challenge | 5% |
| 养号集团 | `CABAL` | 组织化互刷 | 3% |

### 12.2 行为概率分布

| 类型 | 日均发帖 | 日均点赞 | 点赞质量 | 被挑战率 | 挑战成功率 |
| --- | --- | --- | --- | --- | --- |
| ELITE_CREATOR | 0.3 | 5 | 高（跨圈） | 5% | 10% |
| ACTIVE_CREATOR | 1.0 | 10 | 中 | 10% | 20% |
| CURATOR | 0.1 | 20 | 高 | 2% | 5% |
| NORMAL | 0.2 | 3 | 随机 | 5% | 30% |
| LURKER | 0.02 | 0.5 | 随机 | 1% | 20% |
| SPAMMER | 5.0 | 0 | - | 80% | 90% |
| CABAL | 2.0 | 50 | 集团内部 | 30% | 70% |

### 12.3 初始资产分布

| 类型 | 初始 Balance | 充值概率 (月) | 充值金额 |
| --- | --- | --- | --- |
| ELITE_CREATOR | 10,000 sat | 80% | 5,000–20,000 |
| ACTIVE_CREATOR | 5,000 sat | 60% | 2,000–10,000 |
| CURATOR | 3,000 sat | 50% | 1,000–5,000 |
| NORMAL | 1,000 sat | 20% | 500–2,000 |
| LURKER | 500 sat | 5% | 200–1,000 |
| SPAMMER | 2,000 sat | 30% | 1,000–5,000 |
| CABAL | 5,000 sat | 50% | 2,000–10,000 |

---

## 13. 预期稳态分布 (理论值)

基于上述参数，系统长期运行后的预期分布：

| 指标 | White | Green | Blue | Purple | Orange |
| --- | --- | --- | --- | --- | --- |
| 用户占比 | 20% | 45% | 25% | 8% | 2% |
| 日均收入 (sat) | -50 ~ 0 | 0 ~ 100 | 100 ~ 500 | 500 ~ 2000 | 2000 ~ 10000 |
| 影响力广度中位数 | 50 | 500 | 5,000 | 50,000 | 500,000 |
| 影响力深度中位数 | 1.5 | 10 | 50 | 200 | 800 |

---

## Appendix: 快速参考卡片

```
=== 费用速查 ===
发帖: 200 sat × M × K
评论: 50 sat × M × K
点赞: 10 sat × M × K
Challenge L1: 100 sat × K

=== 权重速查 ===
W_trust: White=0.5, Green=1.0, Blue=2.0, Purple=3.5, Orange=6.0
N_novelty: 首次=1.0, 1-3次=0.6, 4-10次=0.3, 11-30次=0.12, 30+=0.05
S_source: 陌生人=1.0, 粉丝=0.15
CE_entropy: 养号互刷=0.1, 同圈=1.0, 跨圈=5.0, 跨语言=10.0

=== 奖励分配 ===
作者: 80%
评论池: 20%
原创对赌加成: ×1.2

=== 信誉计算 ===
TrustScore = 0.30×Creator + 0.25×Curator + 0.25×Juror + 0.20×(1000-Risk)
新用户初始: 550
```
