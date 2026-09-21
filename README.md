# FitTool · 健身热量工具（中国版）

> 一个移动优先的个人健身与营养追踪 PWA：**设定目标 → 今日计划 → 饮食/训练记录 → 打卡 → 周/月趋势**。
> 品牌：**猫卡卞 | LiaLab** ｜ 主色 `#E37499` ｜ 界面语言：简体中文

这个仓库是一个完整的个人作品集项目：从 V1 的单文件原型，演进到 V2 的「前端 PWA + 独立 AI 后端」结构。
重点不在“用了 AI”，而在于把 AI 真正接进一条可靠的产品链路里——结构化输出、结果校验、状态一致性，以及可部署的后端。

---

## 目录

- 它解决什么问题
- 在线地址
- 核心功能
- 系统架构
- 仓库结构
- 快速开始（前端）
- 后端部署（腾讯云 CloudBase Run）
- API 接口
- V1 到 V2：这个项目真实的迭代过程
- 当前状态与已知限制
- Roadmap

---

## 它解决什么问题

多数“卡路里 App”只做一次性计算：吃一顿、算一次、关掉。
FitTool 想做的是长期闭环：先设定一次个性化的身体与训练目标，之后每天只需要回答两个问题——今天吃得怎么样？训练完成了吗？
几周以后，能不能看到趋势在朝目标移动？

三条产品原则决定了它和普通计算器的差别：

| 原则 | 具体做法 |
| --- | --- |
| 计划是稳定的，记录是可变的 | 热量/蛋白质目标由本地公式推导；AI 只负责识别与解析，不负责改写目标。修改某条训练记录后，统计重新派生，而不是重算整套计划。 |
| 不制造伪精度 | 基础代谢、呼吸、日常走动无法实时同步，所以主界面不显示“预计总消耗 / 实时净差 / 消耗缺口进度条”，只保留建议摄入、今日专项运动目标、计划热量缺口。 |
| AI 结果先确认，再入账 | 文字或拍照识别出的饮食/训练结果，先展示给用户确认，确认后才写入本地记录。 |

---

## 在线地址

| 资源 | 地址 |
| --- | --- |
| V2 后端 API（腾讯云 CloudBase Run，运行中） | `https://fittool-api-v2-314671-9-1489196951.sh.run.tcloudbase.com` |
| 后端健康检查 | `https://fittool-api-v2-314671-9-1489196951.sh.run.tcloudbase.com/api/health` |
| V1 原型（历史版本，Cloudflare Workers） | `https://fittool-v1.3345093306.workers.dev/` |

`/api/health` 返回的构建标识为 `v2.3-no-thinking-20260916`。

---

## 核心功能

四个主模块，底部导航对应：目标 / 识别热量 / 健身打卡 / 历史。

**1. 我的目标**

- 详细的个性化设置：性别、年龄、身高、体重、体脂、目标类型（减脂 / 增肌 / 塑形）、训练重点、每周训练次数、日常活动量、伤病避让、单次训练时长、目标体重与体脂。
- 由本地公式推导每日建议摄入、蛋白质目标、今日专项运动目标与计划热量缺口。
- AI 只补充“今天怎么吃、怎么练、怎么恢复”的执行建议，并且前端会清洗返回文本，不会显示 JSON、think、reasoning 等调试内容。
- 弧形摄入卡片上的问候语 / 激励语轮换（约 50% / 50%），填了昵称会显示“Lia，早上好”。

**2. 识别热量（饮食）**

- AI 文字识别：自然语言描述这一餐，返回可编辑的食物条目（名称、份量、热量、蛋白质、碳水、脂肪、置信度）。
- AI 图片识别：拍一张餐食照片，识别可见食物并估算可食份量；酱汁、油、被遮挡的部分会保守估算并降低置信度。
- 快捷录入：米饭一拳、香蕉一根、鸡蛋一个、蛋白粉 30g（约 23g 蛋白质）。
- 识别结果是“待确认”状态，用户可以逐条修改或删除，确认后才计入当天摄入。

**3. 健身打卡**

- AI 文字记录与 AI 运动截图识别共用同一套训练记录（records），不再存在两套互相不同步的今日运动总量。
- 运动截图支持 Apple Watch / Keep / 运动手环等常见截图：优先提取运动类型、时长、活动热量（Active Calories）与平均心率。
- 当截图上同时出现“活动热量”和“总热量”时，活动热量优先，总热量不会被当成额外运动消耗。
- 一条记录可编辑时长与活动热量，也可删除；今日运动总量、七日轨迹、历史统计都由记录实时派生。
- 打卡分享卡片（近全屏圆角）。

**4. 历史**

- 体重折线图，支持按日期补录。
- 训练与饮食按天分组展示。
- 七日打卡轨迹，缺失的日期可以补卡。

**PWA**

- `manifest.webmanifest` + Service Worker（`fittool-v1.8.1-cold-start` 缓存），可添加到主屏幕，独立窗口运行。
- 背景延伸到状态栏区域，避免顶部出现白边；动画支持 `prefers-reduced-motion`。
- 视觉方向为 Apple Liquid Glass：半透明折射玻璃、backdrop blur、细描边、大圆角、柔和渐变。

---

## 系统架构

```
浏览器（FitTool PWA，单文件 index.html）
        |
        |  fetch  /api/food/text  /api/food/vision
        |         /api/workout/text  /api/workout/vision  /api/goal
        v
腾讯云 CloudBase Run 容器（backend/server.js，Node 内置模块，端口 80）
        |
        |  OpenAI 兼容协议  +  thinking: { type: 'disabled' }
        v
TokenHub  (https://tokenhub.tencentmaas.com/v1)
        |
        +--> 文本模型  hy3
        +--> 视觉模型  hy-vision-2.0-instruct
```

- 前端状态保存在浏览器 `localStorage`，**没有账号系统、没有数据库、没有云端写入**。
- 后端是无依赖的 Node HTTP 服务，只做三件事：校验请求 → 调用 AI（要求严格 JSON）→ 校验并归一化模型输出。
- 后端不保存任何用户数据，只有在 CloudBase 环境变量中配置的 `TOKENHUB_API_KEY`（仓库里只有 `.env.example`）。

---

## 仓库结构

```
FitTool-CN/
├── frontend/
│   ├── index.html              # 完整应用（HTML + CSS + JS 单文件）
│   ├── manifest.webmanifest    # PWA 清单
│   ├── sw.js                   # Service Worker（离线缓存）
│   ├── icon-192.png
│   └── icon-512.png
├── backend/
│   ├── server.js               # API 服务，build: v2.3-no-thinking-20260916
│   ├── Dockerfile              # Node 22 alpine，PORT=80
│   ├── package.json
│   ├── .env.example            # 环境变量模板（不含任何真实密钥）
│   └── README.md               # 后端部署与接口说明
└── README.md
```

---

## 快速开始（前端）

前端是纯静态文件，不需要构建步骤。

```bash
cd frontend
python -m http.server 5173
# 浏览器打开 http://localhost:5173
```

> Service Worker 只在 `http://localhost` 或 HTTPS 下生效；直接双击 `index.html` 也行，但没有离线缓存能力。

前端调用后端的地址定义在 `frontend/index.html` 顶部的 `API_BASE` 常量里（当前指向腾讯云 CloudBase Run 的线上地址），改这一行即可切换到自己的后端。

---

## 后端部署（腾讯云 CloudBase Run）

后端是一个无依赖的 Node 服务，任何能跑 Docker 或 Node 18+ 的地方都可以部署。

**环境变量**

| 变量 | 说明 |
| --- | --- |
| `TOKENHUB_API_KEY` | TokenHub 的 API Key，**只配置在云平台环境变量里，不要写进仓库** |
| `AI_BASE_URL` | `https://tokenhub.tencentmaas.com/v1` |
| `AI_TEXT_MODEL` | `hy3` |
| `AI_VISION_MODEL` | `hy-vision-2.0-instruct` |
| `AI_TIMEOUT_MS` | `22000`（失败就快速失败，不让前端干等） |
| `ALLOWED_ORIGIN` | 允许的前端来源；开发阶段可以是 `*`，上线后建议改成具体域名 |
| `PORT` | 默认 `80`（与 CloudBase Run 的端口探针保持一致） |

**本地运行**

```bash
cd backend
cp .env.example .env      # 填入自己的 key
npm start                 # 或 node --watch server.js
curl http://localhost/api/health
```

**CloudBase Run 部署要点**

1. 用 Dockerfile 构建镜像，容器内监听 `80` 端口（官方早期踩坑：Node 默认监听 3000，而探针检测 80，导致部署后一直不健康）。
2. 环境变量在 CloudBase 控制台配置，不要打进镜像。
3. 部署完成后先访问 `/api/health`，确认 `build` 与 `aiConfigured` 都符合预期。

---

## API 接口

所有接口都是 JSON。CORS 由 `ALLOWED_ORIGIN` 控制。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/health`、`/api/health` | 服务、构建号、模型配置状态 |
| `POST` | `/api/food/text` | 文字饮食描述 → 食物条目与营养 |
| `POST` | `/api/food/vision` | 餐食照片 → 食物条目与营养 |
| `POST` | `/api/workout/text` | 文字训练描述 → 训练条目与活动消耗 |
| `POST` | `/api/workout/vision` | 运动 App 截图 → 训练条目与活动消耗 |
| `POST` | `/api/goal` | 资料 + 目标 + 今日记录 → 一段执行建议 |

**请求示例**

```json
POST /api/food/text
{ "text": "中午吃了一碗米饭、两个鸡蛋和一份鸡胸肉" }
```

```json
POST /api/food/vision
{ "image": "data:image/jpeg;base64,...", "supplement": "可选的补充说明" }
```

```json
POST /api/workout/text
{ "text": "跑步 35 分钟，大概消耗 310 千卡", "context": { "weight": 60 } }
```

```json
POST /api/workout/vision
{ "image": "data:image/png;base64,..." }
```

```json
POST /api/goal
{
  "profile": { "...": "用户资料" },
  "targets": { "...": "既定目标（建议摄入、蛋白质、运动目标）" },
  "today": { "...": "今日已记录" }
}
```

**返回约定**

- 饮食：`items[]` 每项包含 `name` / `label` / `kcal` / `protein` / `carb` / `fat` / `confidence`。
- 训练：`items[]` 每项包含 `activity` / `duration_min` / `active_kcal` / `confidence` / `notes`。
- 建议：`{ "ok": true, "advice": "..." }`，前端只展示清洗后的 `advice` 文本。
- 失败：`{ "error": "人类可读的中文原因" }`，并带合适的 HTTP 状态码。

---

## V1 到 V2：这个项目真实的迭代过程

这一节是这个仓库最值得读的部分——它不是一次性生成的模板，而是被真实问题推着走出来的。

| 阶段 | 形态 | 问题 |
| --- | --- | --- |
| V1 原型 | 一个很大的 `index.html` + Cloudflare Worker，Worker 调火山引擎 Ark 北京 | 文字饮食其实主要靠前端本地食物库匹配，只有图片才真的走 AI |
| V1 暴露的问题 | 训练截图识别写 `activityToday`，文字训练写 `workoutHistory` | 同一件事有两套状态，删除记录后今日总量不一定重算 |
| V1 暴露的问题 | 界面上同时有总消耗、缺口、净差 | 用户会误以为是实时精准数据 |
| V2 前端 | 拆出 PWA 结构，统一 records 作为事实来源，UI 改为 Liquid Glass | 统计全部由记录派生 |
| V2 后端 | 迁移到腾讯云 CloudBase Run + TokenHub（Hy3 / HY-Vision） | 见下面两个真实调试故事 |

**故事一：中文识别失败，不是编码问题**

中文食物文字识别一开始返回不完整的内容。排查后发现不是编码，而是模型的 reasoning 占用了 1354/1400 个 completion token，导致 JSON 被截断。
解决方式是在文本与建议路由上显式关闭思考：`thinking: { type: 'disabled' }`，这就是构建号 `v2.3-no-thinking` 的由来。

**故事二：容器部署失败，端口探针对不上**

CloudBase Run 早期部署后一直不健康。原因是 Node 服务默认监听 3000，而平台探针检查 80。
现在 `server.js` 默认端口就是 `80`，Dockerfile 里也用 `PORT=80`，两者保持一致。

**还做过的工程约束**

- 所有 AI 路由都要求严格 JSON Schema 输出，返回后仍在服务端逐字段校验、归一化、重新汇总。
- 图片走 Base64，请求体上限 9MB；超时 22 秒，宁可快速失败也不让前端长时间转圈。
- 前端把识别结果做成“待确认 → 用户确认 → 写入记录”，AI 永远不直接写数据。

---

## 当前状态与已知限制

**已经验证可用**

- 后端 `v2.3-no-thinking-20260916` 四条 AI 路由（饮食文字、饮食图片、训练文字、训练截图）+ 目标建议，均已实测。
- PWA 可安装、可离线打开应用外壳。

**已知限制（诚实说明）**

- 数据只存在浏览器 `localStorage`，换设备或清缓存会丢失，**没有账号与云同步**。
- 没有服务端数据库（PostgreSQL 是后续计划，尚未实现）。
- `ALLOWED_ORIGIN` 目前是 `*`，属于上线前的临时配置，正式发布应改成具体域名。
- 营养与消耗都是估算值，产品规则是"用户确认后才入账"。

---

## Roadmap

1. 后端账号与数据同步（PostgreSQL），让记录跨设备可用。
2. 收紧 CORS 到具体域名，并给 AI 路由加更严格的限流。
3. 训练与饮食的记录编辑体验继续打磨（批量编辑、重复记录）。
4. 周计划 / 月复盘视图，加入更完整的趋势洞察。
5. 补齐自动化测试与部署说明文档。

---

## 说明

- 本仓库不包含任何 API Key、账号或控制台敏感信息，只有 `.env.example`。
- 识别结果均为估算，不构成医疗建议。

个人品牌：**猫卡卞 | LiaLab**
