# BitLink Sprint Plan

> 极简版，基于 `simulator/SYSTEM_DESIGN.md`

---

## 当前状态

**重构中**：从复杂系统迁移到极简系统（动态点赞定价 + 早期点赞者分成）

旧版本已保存到 `legacy-complex` 分支。

---

## Sprint 1 - 极简 MVP

### 目标

实现核心的「点赞即投资」机制

### 任务

| 任务 | 状态 | 说明 |
|------|------|------|
| 用户余额系统 | 待开始 | 简化版 Ledger |
| 动态点赞定价 | 待开始 | `cost = max(5, 100 / sqrt(1 + likes))` |
| 早期点赞者分成 | 待开始 | 50% 作者，40% 早期点赞者，10% 平台 |
| 发帖（免费） | 待开始 | 无费用 |
| 基础 Feed | 待开始 | 按时间排序 |

### 数据模型

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

### API 端点

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

## Sprint 2 - 防作弊

### 任务

| 任务 | 状态 | 说明 |
|------|------|------|
| 手机号验证 | 待开始 | 防多账号 |
| 邀请制 | 待开始 | 控制用户质量 |
| 收益封顶 | 待开始 | 早期点赞者最多赚 2x |

---

## Sprint 3 - 经济闭环

### 任务

| 任务 | 状态 | 说明 |
|------|------|------|
| 充值 | 待开始 | sat 购买 |
| 提现 | 待开始 | sat 兑换 |

---

## 历史记录

旧的复杂 Sprint 计划（S1-S17）已归档到 `legacy-complex` 分支。

---

*极简版 Sprint Plan，2026-03-10*
