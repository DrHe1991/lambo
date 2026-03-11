# BitLink 参数手册

> 极简版

---

## 核心参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `LIKE_COST_BASE` | 100 sat | 0 赞时的点赞成本 |
| `LIKE_COST_MIN` | 5 sat | 最低点赞成本 |
| `AUTHOR_SHARE` | 50% | 作者分成 |
| `EARLY_LIKER_SHARE` | 40% | 早期点赞者分成 |
| `PLATFORM_SHARE` | 10% | 平台分成 |
| `NEW_USER_BONUS` | 1000 sat | 新用户赠送 |
| `INVITE_BONUS` | 500 sat | 邀请奖励 |

---

## 动态点赞定价公式

```python
def like_cost(current_likes: int) -> int:
    BASE = 100
    MIN = 5
    return max(MIN, int(BASE / (1 + current_likes) ** 0.5))
```

| 当前赞数 | 点赞成本 |
|----------|----------|
| 0 | 100 sat |
| 5 | 41 sat |
| 20 | 22 sat |
| 100 | 10 sat |
| 500+ | 5 sat |

---

## 早期点赞者权重公式

```python
def liker_weight(cost_paid: int, like_rank: int) -> float:
    early_bonus = max(1.0, 1.5 - (like_rank / 100) * 0.5)
    return cost_paid * early_bonus
```

---

## 收益分配

```
点赞支付 X sat
    │
    ├── 50% ──→ 作者
    │
    ├── 40% ──→ 早期点赞者池（按权重分配）
    │
    └── 10% ──→ 平台
```

---

## 历史记录

旧的复杂参数文档已归档到 `legacy-complex` 分支，包括：
- 四维信誉系统
- 垃圾压力指数
- 共识熵计算
- Discovery Score
- Challenge 层级
- 高质沙龙经济学

---

*极简版参数手册，2026-03-10*
