# BitLink 产品路线图

> 极简版，专注核心机制验证

---

## 核心机制

1. **动态点赞定价**：赞越少越贵，赞越多越便宜
2. **早期点赞者分成**：后来人的钱，分给前面的人

---

## Phase 1：极简 MVP

**目标**：验证「点赞即投资」机制是否成立

### 必做功能

| 功能 | 说明 |
|------|------|
| 用户注册/登录 | Google Sign-In |
| 余额系统 | 新用户赠送 1000 sat |
| 发帖 | 免费发帖 |
| 点赞 | 动态定价 + 早期分成 |
| Feed | 简单按时间排序 |

### 不做的功能

- 评论系统
- 关注系统
- 频道分类
- 复杂推荐算法
- 充值/提现
- 任何复杂机制

### 验收标准

- 用户能发帖
- 用户能点赞（看到动态价格）
- 早期点赞者能看到收益增长
- 作者能看到收入

---

## Phase 2：防作弊 + 身份验证

**目标**：解决自刷、鲸鱼垄断问题

### 功能

| 功能 | 说明 |
|------|------|
| 手机号验证 | 防止多账号 |
| 邀请制 | 控制用户质量 |
| 收益封顶 | 早期点赞者最多赚 2x |
| 单帖点赞上限 | 防止鲸鱼垄断 |

---

## Phase 3：经济闭环

**目标**：引入真实资金，可持续运营

### 功能

| 功能 | 说明 |
|------|------|
| 充值 | sat 购买 |
| 提现 | sat 兑换 |
| 广告系统 | 外部资金注入 |
| 订阅功能 | 创作者变现 |

---

## Phase 4：社交功能

**目标**：增加留存和粘性

### 功能

| 功能 | 说明 |
|------|------|
| 评论 | 评论也能被赞 |
| 关注 | 关注流 |
| 私信 | 用户沟通 |
| 通知 | 收益/互动提醒 |

---

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Python FastAPI |
| 数据库 | PostgreSQL |
| 前端 | React + Capacitor |
| 部署 | Docker |

---

## 数据模型（Phase 1）

```sql
-- 用户
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    balance BIGINT DEFAULT 1000,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 帖子
CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    author_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    like_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 点赞
CREATE TABLE likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id),
    user_id INTEGER REFERENCES users(id),
    cost_paid INTEGER NOT NULL,
    weight FLOAT NOT NULL,
    earnings INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);
```

---

## API 端点（Phase 1）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/register | 注册 |
| POST | /auth/login | 登录 |
| GET | /users/me | 获取当前用户 |
| GET | /posts | 获取帖子列表 |
| POST | /posts | 发帖 |
| POST | /posts/{id}/like | 点赞 |
| GET | /posts/{id}/like-cost | 获取当前点赞价格 |

---

## 成功指标

### Phase 1

| 指标 | 目标 |
|------|------|
| 日活用户 | 100+ |
| 日均发帖 | 50+ |
| 日均点赞 | 500+ |
| 用户留存（7日） | 30%+ |

### Phase 2+

| 指标 | 目标 |
|------|------|
| 月活用户 | 10,000+ |
| 创作者收入 | $1,000+/月 |
| 平台收入 | $500+/月 |

---

*极简版路线图，2026-03-10*
