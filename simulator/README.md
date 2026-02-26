# BitLink Economic Simulator

基于第一性原理设计的 BitLink 经济系统模拟器，用于验证平台机制的可行性。

## 项目结构

```
simulator/
├── config.py          # 所有经济参数配置
├── models.py          # 数据模型（User, Content, Challenge等）
├── engine.py          # 经济引擎（费用计算、奖励分配、Discovery Score）
├── simulation.py      # 主模拟循环
├── analysis.py        # 结果分析与报告生成
├── requirements.txt   # 依赖（仅使用标准库）
└── README.md
```

## 用户类型分布（10,000人）

| 类型 | 占比 | 人数 | 描述 |
|------|------|------|------|
| **ELITE_CREATOR** | 2% | 200 | 高质量原创者，跨圈传播 |
| **ACTIVE_CREATOR** | 8% | 800 | 活跃创作者，中等质量 |
| **CURATOR** | 10% | 1,000 | 策展人，少发帖多点赞 |
| **NORMAL** | 35% | 3,500 | 普通用户 |
| **LURKER** | 15% | 1,500 | 潜水者 |
| **EXTREME_MARKETER** | 5% | 500 | 博眼球极端营销号 |
| **AD_SPAMMER** | 3% | 300 | 广告引流垃圾号 |
| **LOW_QUALITY_CREATOR** | 8% | 800 | 水平不行的创作者 |
| **TOXIC_CREATOR** | 4% | 400 | 极端观点/恶意内容创作者 |
| **STUPID_AUDIENCE** | 5% | 500 | 容易被垃圾内容吸引的观众 |
| **MALICIOUS_CHALLENGER** | 2% | 200 | 恶意举报者 |
| **CABAL_MEMBER** | 3% | 300 | 有组织的刷粉/互赞集团 |

## 运行方式

```bash
cd simulator
python simulation.py
```

## 模拟内容

### 每日行为
- **发帖**：根据用户类型概率发帖，质量由 `content_quality` 决定
- **点赞**：根据 `like_quality` 选择内容，Cabal成员优先互赞
- **评论**：对现有内容发表评论
- **举报**：根据 `challenge_accuracy` 发起挑战

### 经济循环
1. 所有行为花费进入**奖励池**
2. 每7天结算一次，按 **Discovery Score** 分配奖励
3. Discovery Score = W_trust × N_novelty × S_source × CE_entropy × Scout_mult
4. 违规内容被罚款，罚款分配给举报者/陪审团/奖励池

### 信誉系统
- **CreatorScore**：内容质量评分
- **CuratorScore**：点赞判断力评分
- **JurorScore**：陪审准确性评分
- **RiskScore**：账户风险评分

`TrustScore = 0.30×Creator + 0.25×Curator + 0.25×Juror + 0.20×(1000-Risk)`

### 反共谋机制
- **共识熵 (CE)**：同圈互赞权重极低 (0.1)，跨圈点赞权重高 (5.0-10.0)
- **Cabal检测**：内部互动比例过高时触发，全员扣信誉

## 输出结果

运行后生成两个文件：
- `simulation_report.txt`：可读的分析报告
- `simulation_data.json`：原始数据（可用于可视化）

## 预期验证目标

✅ **好人赚钱**：ELITE_CREATOR、CURATOR 应该是净赚
❌ **坏人亏钱**：AD_SPAMMER、TOXIC_CREATOR 应该是净亏
✅ **Cabal无效**：组织化刷分应该比正常使用收益更低
✅ **信誉分层**：好人信誉上升，坏人信誉下降

## 参数调整

所有参数定义在 `config.py` 中，包括：
- 行为费用（发帖 200 sat、点赞 10 sat 等）
- Discovery Score 权重
- 信誉变化规则
- 用户行为概率分布

可以通过修改这些参数来测试不同的经济模型。
