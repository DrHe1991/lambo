# BitLink 极简经济系统设计

> 最后更新：2026-03-10

---

## 核心理念

**点赞即投资**：早发现好内容的人获得回报，后来者为早期支持者买单。

---

## 1. 核心机制

### 1.1 动态点赞定价

赞越少，点赞越贵；赞越多，点赞越便宜。

```python
def like_cost(current_likes: int) -> int:
    """动态计算点赞成本"""
    BASE = 100  # 0 赞时的最高成本
    MIN = 5     # 最低成本
    return max(MIN, int(BASE / (1 + current_likes) ** 0.5))
```

| 当前赞数 | 点赞成本 | 角色定位 |
|----------|----------|----------|
| 0 | 100 sat | 先驱者（高风险高回报） |
| 5 | 41 sat | 早期发现者 |
| 20 | 22 sat | 中期加入者 |
| 100 | 10 sat | 跟风者 |
| 500+ | 5 sat | 打赏者（几乎无回报） |

### 1.2 收益分配

每次点赞支付的 sat 按以下比例分配：

```
点赞支付 X sat
    │
    ├── 50% ──→ 作者（直接收入）
    │
    ├── 40% ──→ 早期点赞者池（按权重分配）
    │
    └── 10% ──→ 平台
```

### 1.3 早期点赞者权重

```python
def liker_weight(cost_paid: int, like_rank: int) -> float:
    """花的钱越多、点赞越早，权重越高"""
    early_bonus = max(1.0, 1.5 - (like_rank / 100) * 0.5)
    return cost_paid * early_bonus
```

### 1.4 删帖规则

```
帖子被删除 → 所有点赞者的投资归零，不退款
```

点赞 = 你为这个内容背书。内容违规，你也承担后果。

---

## 2. 数据模型

### 2.1 用户表 (users)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| username | VARCHAR | 用户名 |
| balance | BIGINT | 余额 (sat) |
| created_at | TIMESTAMP | 注册时间 |

### 2.2 帖子表 (posts)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| author_id | INTEGER | 作者 ID |
| content | TEXT | 内容 |
| like_count | INTEGER | 当前赞数 |
| status | VARCHAR | active / deleted |
| created_at | TIMESTAMP | 发布时间 |

### 2.3 点赞表 (likes)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| post_id | INTEGER | 帖子 ID |
| user_id | INTEGER | 点赞者 ID |
| cost_paid | INTEGER | 支付的 sat |
| weight | FLOAT | 分成权重 |
| earnings | INTEGER | 已获得收益 |
| created_at | TIMESTAMP | 点赞时间 |

---

## 3. 核心流程

### 3.1 发帖

```
用户发帖
    │
    └── 免费（不收费）
```

### 3.2 点赞

```python
async def process_like(post_id: int, user_id: int):
    post = get_post(post_id)
    
    # 1. 计算动态成本
    cost = like_cost(post.like_count)
    
    # 2. 检查余额并扣款
    if user.balance < cost:
        raise InsufficientBalance()
    debit(user_id, cost)
    
    # 3. 分配收益
    author_share = cost * 0.50
    pool_share = cost * 0.40
    platform_share = cost * 0.10
    
    # 给作者
    credit(post.author_id, author_share)
    
    # 给早期点赞者
    distribute_to_early_likers(post_id, pool_share)
    
    # 平台收入
    add_platform_revenue(platform_share)
    
    # 4. 记录点赞
    weight = liker_weight(cost, post.like_count + 1)
    create_like(post_id, user_id, cost, weight)
    
    # 5. 更新帖子
    post.like_count += 1
```

### 3.3 分配给早期点赞者

```python
async def distribute_to_early_likers(post_id: int, pool_amount: int):
    likes = get_all_likes(post_id)
    
    if not likes:
        # 第一个赞，没有早期点赞者，全给平台
        add_platform_revenue(pool_amount)
        return
    
    total_weight = sum(like.weight for like in likes)
    
    for like in likes:
        share = pool_amount * (like.weight / total_weight)
        like.earnings += share
        credit(like.user_id, share)
```

### 3.4 删帖

```python
async def delete_post(post_id: int):
    post = get_post(post_id)
    post.status = 'deleted'
    # 点赞者的 cost_paid 已经扣除，不退款
    # 他们的「投资」归零
```

---

## 4. 行为成本

| 行为 | 成本 | 说明 |
|------|------|------|
| 发帖 | 0 sat | 免费 |
| 点赞 | 5-100 sat | 动态定价 |

---

## 5. 用户获取余额

### Phase 1（内测期）

| 方式 | 金额 |
|------|------|
| 新用户注册 | 赠送 1000 sat |
| 邀请新用户 | 双方各得 500 sat |

### Phase 2（正式上线）

| 方式 | 说明 |
|------|------|
| 充值 | 真钱兑换 sat |
| 创作收益 | 帖子被点赞获得收入 |
| 投资收益 | 早期点赞获得分成 |

---

## 6. 风险与应对

| 风险 | 应对方案 |
|------|----------|
| **自刷小号** | Phase 2 引入手机验证/邀请制 |
| **鲸鱼垄断** | 考虑单用户每帖点赞上限 |
| **庞氏结构** | 早期点赞者收益封顶 2x |
| **内容违规** | 删帖 = 点赞者全亏 |

---

## 7. 参数速查

| 参数 | 值 |
|------|-----|
| LIKE_COST_BASE | 100 sat |
| LIKE_COST_MIN | 5 sat |
| AUTHOR_SHARE | 50% |
| EARLY_LIKER_SHARE | 40% |
| PLATFORM_SHARE | 10% |
| NEW_USER_BONUS | 1000 sat |
| INVITE_BONUS | 500 sat |

---

## 8. 这就是全部

```
┌─────────────────────────────────────────┐
│                 BitLink                 │
├─────────────────────────────────────────┤
│  用户                                    │
│    └── 余额                              │
│                                         │
│  帖子                                    │
│    ├── 内容                              │
│    ├── 作者                              │
│    └── 赞数                              │
│                                         │
│  点赞                                    │
│    ├── 动态定价（赞少贵）                  │
│    └── 分成（50% 作者, 40% 早期, 10% 平台）│
│                                         │
│  删帖                                    │
│    └── 删除 = 点赞者亏钱                  │
└─────────────────────────────────────────┘
```

**没有其他机制。**

---

*此文档为 BitLink 极简版核心设计，2026-03-10*
