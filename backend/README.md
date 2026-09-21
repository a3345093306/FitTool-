# FitTool CN API（腾讯云 CloudBase Run）

`server.js` 是 FitTool 中国版的后端：一个**零依赖**的 Node HTTP 服务，负责把前端的识别请求转成
TokenHub 上的 Hy3 / HY-Vision 调用，并且只返回经过校验的结构化 JSON。

```
FitTool 前端  ->  本服务（CloudBase Run，端口 80）  ->  TokenHub  ->  hy3 / hy-vision-2.0-instruct
```

## 构建标识

```js
const BUILD_ID = 'v2.3-no-thinking-20260916';
```

`v2.3-no-thinking` 的含义：文本与建议路由显式关闭模型思考
（`thinking: { type: 'disabled' }`）。之前的版本里 reasoning 会占用
1354/1400 个 completion token，导致中文识别结果的 JSON 被截断。

## 文件

| 文件 | 说明 |
| --- | --- |
| `server.js` | 全部逻辑：CORS、路由、Prompt、JSON Schema、输出归一化 |
| `Dockerfile` | `node:22-alpine`，`PORT=80` |
| `package.json` | `npm start` / `npm run dev`（无第三方依赖） |
| `.env.example` | 环境变量模板，**不含真实密钥** |

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `TOKENHUB_API_KEY` | 是 | - | TokenHub API Key，只放在云平台环境变量里 |
| `AI_BASE_URL` | 否 | `https://tokenhub.tencentmaas.com/v1` | OpenAI 兼容 Base URL |
| `AI_TEXT_MODEL` | 否 | `hy3` | 文本模型 |
| `AI_VISION_MODEL` | 否 | `hy-vision-2.0-instruct` | 视觉模型 |
| `AI_TIMEOUT_MS` | 否 | `22000` | 单次上游调用超时（5s - 45s） |
| `ALLOWED_ORIGIN` | 否 | `*` | 允许的前端来源，可用逗号分隔多个 |
| `PORT` | 否 | `80` | 监听端口，需与平台探针端口一致 |

## 本地运行

```bash
cp .env.example .env     # 填入自己的 TOKENHUB_API_KEY
node --env-file=.env server.js
curl http://localhost/api/health
```

Node 18+ 即可运行，不需要 `npm install`。

## 接口

| 方法 | 路径 | 请求体 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/health`、`/api/health` | - | 构建号、模型配置、`aiConfigured` |
| `POST` | `/api/food/text` | `{ text }` | 文字饮食 → 食物条目 |
| `POST` | `/api/food/vision` | `{ image, supplement? }` | 餐食照片 → 食物条目 |
| `POST` | `/api/workout/text` | `{ text, context?: { weight } }` | 文字训练 → 训练条目 |
| `POST` | `/api/workout/vision` | `{ image }` | 运动截图 → 训练条目 |
| `POST` | `/api/goal` | `{ profile, targets, today }` | 今日执行建议 |

饮食条目字段：`name` / `label` / `kcal` / `protein` / `carb` / `fat` / `confidence`。
训练条目字段：`activity` / `duration_min` / `active_kcal` / `confidence` / `notes`。
建议接口返回 `{ ok: true, advice: "…" }`。

## 关键实现约定

- **严格 JSON**：每个路由都带 `response_format: json_schema`，服务端再把模型输出重新解析、裁剪、
  归一化，绝不相信模型自由文本。
- **活动热量优先**：截图上同时出现活动热量与总热量时，`active_kcal` 取活动热量，
  不把总热量当成额外运动消耗。
- **份量诚实**：用户给了克数/个数/拳/勺就用用户的；没给的给保守估算并降低 `confidence`。
- **不保存数据**：服务端没有任何写路径，也不落库，记录属于前端 `localStorage`。
- **端口一致**：容器内监听 80，与 CloudBase Run 端口探针一致（否则会一直不健康）。

## 部署

1. 构建镜像（Dockerfile 已就绪）。
2. 在 CloudBase Run 上创建服务，端口填 `80`。
3. 环境变量里配置 `TOKENHUB_API_KEY` 等，不要写进仓库。
4. 部署后访问 `/api/health` 验证构建号与 `aiConfigured`。
