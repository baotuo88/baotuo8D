# 8D AI报告系统（企业级）

基于 `React + Vite + Tailwind`、`Node.js + Express`、`PostgreSQL`、`Chroma` 和 OpenAI 兼容接口构建的前后端分离项目。

## 项目特性

- 前后端分离架构
- 8D 报告 AI 自动生成（D1-D8）
- PostgreSQL 结构化存储
- Chroma 向量索引与语义检索
- 企业级 RAG 案例库：结构化抽取、语义切分、Metadata 过滤、Rerank、8D 增强生成
- JWT 认证 + bcrypt 密码加密
- RBAC 权限模型（`admin` / `user`）
- Docker / Docker Compose 一键部署

## 目录结构

```text
.
├── .env.example
├── .gitignore
├── docker-compose.yml
├── README.md
├── backend
│   ├── .dockerignore
│   ├── Dockerfile
│   ├── package.json
│   ├── package-lock.json
│   ├── sql
│   │   └── init.sql
│   └── src
│       ├── app.js
│       ├── server.js
│       ├── config/env.js
│       ├── constants/roles.js
│       ├── db/pool.js
│       ├── middleware
│       │   ├── authMiddleware.js
│       │   └── rbacMiddleware.js
│       ├── routes
│       │   ├── authRoutes.js
│       │   ├── healthRoutes.js
│       │   ├── reportRoutes.js
│       │   └── userRoutes.js
│       ├── services
│       │   ├── authService.js
│       │   ├── chromaService.js
│       │   ├── openaiService.js
│       │   ├── reportService.js
│       │   └── userService.js
│       └── utils
│           ├── httpError.js
│           ├── json.js
│           ├── prompt.js
│           └── validators.js
└── frontend
    ├── .dockerignore
    ├── Dockerfile
    ├── nginx.conf
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── vite.config.js
    └── src
        ├── App.jsx
        ├── index.css
        ├── main.jsx
        └── components
            ├── ReportCard.jsx
            └── ReportForm.jsx
```

## 启动方式（Docker）

### 1. 准备环境变量

```bash
cp .env.example .env
```

编辑 `.env`，生产环境至少填入：

```env
OPENAI_API_KEY=your_real_key
JWT_SECRET=replace_with_a_long_random_secret_at_least_32_chars
```

可选安全配置：

```env
JWT_EXPIRES_IN=12h
BCRYPT_SALT_ROUNDS=12
ADMIN_REGISTER_TOKEN=your_admin_bootstrap_token
CORS_ORIGIN=https://your-domain.com
BACKEND_LOG_LEVEL=info
BACKEND_LOG_PRETTY=false
```

说明：
- `ADMIN_REGISTER_TOKEN` 为空时，不允许通过 API 注册管理员。
- 需要创建管理员时，在请求体中传 `role=admin` + 正确的 `adminRegisterToken`。
- `JWT_SECRET` 建议使用长度 32+ 的随机字符串。
- 生产环境不要保留默认数据库密码。

### 2. 构建并启动

```bash
docker compose up -d --build
```

### 3. 访问服务

- 前端：http://localhost:3000
- 后端健康检查：http://localhost:8080/api/health
- 前端健康检查：http://localhost:3000/health
- Chroma：http://localhost:8000

### 4. 查看容器状态与日志

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
docker compose logs -f chroma
```

说明：
- `backend` 输出结构化 stdout/stderr 日志，适合容器采集。
- `frontend` 使用 nginx access/error log。
- `docker-compose.yml` 已配置 `json-file` 日志轮转。

### 5. 停止服务

```bash
docker compose down
```

如果需要同时删除数据卷：

```bash
docker compose down -v
```

## 生产部署配置说明

当前项目已经包含完整生产部署编排：

- `docker-compose.yml`
  - 前后端分容器
  - PostgreSQL 独立容器
  - Chroma 独立容器
  - `depends_on + healthcheck`
  - `restart: unless-stopped`
  - 日志轮转配置
- `backend/Dockerfile`
  - 基于 `node:20-alpine`
  - 使用 `npm ci --omit=dev`
  - 内置健康检查
- `frontend/Dockerfile`
  - 多阶段构建
  - `Vite build + nginx` 托管
  - 内置健康检查
- `frontend/nginx.conf`
  - SPA 回退
  - `/api/` 反向代理到后端
  - `/health` 健康检查

### 生产迁移机制

- 已引入版本化迁移目录：`backend/sql/migrations/`
- 迁移执行脚本：`backend/scripts/migrate.js`
- Docker 编排包含一次性迁移服务 `migrator`：
  - `backend` / `worker` 仅在迁移成功后启动
  - 避免“应用版本已升级但表结构未升级”的线上故障

## 环境变量

关键变量见 `.env.example`，生产常用项包括：

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_PORT`
- `BACKEND_PORT`
- `FRONTEND_PORT`
- `CHROMA_PORT`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `EMBEDDING_MODEL`
- `CORS_ORIGIN`
- `BACKEND_LOG_LEVEL`
- `BACKEND_LOG_PRETTY`
- `TZ`

## 健康检查

- `postgres`
  - 使用 `pg_isready`
- `chroma`
  - 使用 `GET /api/v2/heartbeat`
- `redis`
  - 使用 `PING`
- `backend`
  - 使用 `GET /api/health`
  - 检查数据库、Redis、Chroma 连通性
- `frontend`
  - 使用 `GET /health`

## 监控指标（Prometheus）

- 后端指标端点：`GET /metrics`
- 若设置 `METRICS_TOKEN`，需要在请求头中带上：
  - `Authorization: Bearer <METRICS_TOKEN>` 或
  - `X-Metrics-Token: <METRICS_TOKEN>`
- 当前包含：
  - `http_requests_total`
  - `http_errors_total`
  - `http_request_duration_ms_avg`
  - `http_request_duration_ms_bucket`
  - `http_requests_by_method_total`
  - `http_requests_by_status_total`
  - `http_requests_by_route_total`

Prometheus 建议使用 secret file 方式注入 token（避免明文写入配置）：

```bash
export METRICS_TOKEN=your_metrics_token
./deploy/monitoring/generate-secrets.sh
docker compose --profile prod --profile monitoring up -d --build
```

## 上线最小安全基线

- 生产环境禁止 `CORS_ORIGIN=*`（服务启动时会拒绝启动）
- 默认启用 `helmet` 安全响应头
- 全局接口限流（`SECURITY_GLOBAL_RATE_*`）
- 认证接口限流（`SECURITY_AUTH_RATE_*`，覆盖 `/api/auth/login`、`/api/auth/register`）

建议生产环境配置：

```env
NODE_ENV=production
CORS_ORIGIN=https://your-frontend-domain.com
SECURITY_ENABLE_HELMET=true
SECURITY_GLOBAL_RATE_WINDOW_MS=60000
SECURITY_GLOBAL_RATE_MAX=300
SECURITY_AUTH_RATE_WINDOW_MS=60000
SECURITY_AUTH_RATE_MAX=20
JWT_SECRET=replace_with_a_long_random_secret_at_least_32_chars
```

## 上线前冒烟测试

后端提供最小 smoke 测试脚本（健康检查 + 登录链路）：

```bash
cd backend
SMOKE_BASE_URL=http://127.0.0.1:8080/api npm run smoke
```

集成测试（包含 metrics 与业务接口）：

```bash
cd backend
TEST_BASE_URL=http://127.0.0.1:8080/api npm run test:integration
```

## 备份与恢复

数据库备份：

```bash
cd backend
DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/db-backup.sh ./backups
```

数据库恢复：

```bash
cd backend
DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/db-restore.sh ./backups/xxx.dump
```

## CI 质量门禁

- 已包含 GitHub Actions：`.github/workflows/ci.yml`
- PR / Push 会执行：
  - backend 依赖安装 + 语法检查
  - migration 执行
  - backend 启动后 smoke 测试
  - frontend build

## 发布手册

- 详见 [RELEASE.md](/Users/yewuchen/Desktop/宝拓8D/RELEASE.md)
- 上线检查清单： [GO_LIVE_CHECKLIST.md](/Users/yewuchen/Desktop/宝拓8D/GO_LIVE_CHECKLIST.md)
- 一键预检脚本： [go-live-preflight.sh](/Users/yewuchen/Desktop/宝拓8D/scripts/go-live-preflight.sh)

## Compose Profiles

- `dev`：本地开发（默认端口暴露）
- `prod`：生产部署基线
- `monitoring`：可选监控组件（Prometheus）

启动示例：

```bash
# 开发
docker compose --profile dev up -d --build

# 生产（含监控）
docker compose --profile prod --profile monitoring up -d --build
```

## 公网暴露策略模板

- Nginx 模板（默认禁止公网访问 `/metrics`）：
  - [nginx-public-template.conf](/Users/yewuchen/Desktop/宝拓8D/deploy/edge/nginx-public-template.conf)
- Kubernetes Ingress 模板（默认禁止公网访问 `/metrics`）：
  - [ingress-public-template.yaml](/Users/yewuchen/Desktop/宝拓8D/deploy/edge/ingress-public-template.yaml)

## 日志系统

- 后端新增轻量结构化日志，输出字段包括：
  - `timestamp`
  - `level`
  - `event`
  - `service`
  - `method/path/status_code/duration_ms`
- 通过环境变量控制：
  - `BACKEND_LOG_LEVEL`
  - `BACKEND_LOG_PRETTY`
- Docker 日志驱动采用 `json-file`，并设置轮转：
  - `max-size`
  - `max-file`

## 本地开发（可选）

### 后端

```bash
cd backend
npm install
npm run dev
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

本地开发时可在 `frontend/.env` 中添加：

```env
VITE_API_BASE=http://localhost:8080/api
```

## 用户系统与权限模型

### JWT 认证

- 登录/注册成功返回 `token`
- 后续请求在 Header 携带：

```http
Authorization: Bearer <token>
```

### RBAC

- `admin`：可查看全部用户、全部报告、全量向量检索
- `user`：只能查看/检索/创建自己的报告

## API 接口说明

### 1) 健康检查

- `GET /api/health`
- 鉴权：否

### 2) 注册

- `POST /api/auth/register`
- 鉴权：否

请求体：

```json
{
  "name": "Alice",
  "email": "alice@company.com",
  "password": "StrongPass123",
  "role": "user",
  "adminRegisterToken": "optional"
}
```

说明：
- `role` 可选，默认 `user`
- 若 `role=admin`，必须提供正确 `adminRegisterToken`

响应：

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "name": "Alice",
      "email": "alice@company.com",
      "role": "user",
      "isActive": true,
      "createdAt": "2026-04-29T00:00:00.000Z"
    },
    "token": "jwt"
  }
}
```

### 3) 登录

- `POST /api/auth/login`
- 鉴权：否

请求体：

```json
{
  "email": "alice@company.com",
  "password": "StrongPass123"
}
```

响应：同注册。

### 4) 当前用户

- `GET /api/auth/me`
- 鉴权：是（任意已登录用户）

### 5) 用户列表（管理员）

- `GET /api/users?limit=50`
- 鉴权：是（`admin`）

### 6) 报告列表

- `GET /api/reports?limit=20`
- 鉴权：是
- 权限：
  - `admin` 返回全部
  - `user` 返回本人数据

### 7) 生成 8D 报告

- `POST /api/reports`
- 鉴权：是
- 权限：`admin` / `user`

请求体：

```json
{
  "title": "装配线扭矩失效",
  "problemStatement": "终检发现产品扭矩不足，24小时内出现17次",
  "impact": "返工率上升12%，交付延迟",
  "rootCauseHint": "怀疑新批次电批校准偏移",
  "teamMembers": ["QE", "PE", "ME"]
}
```

### 8) 向量检索

- `POST /api/reports/search`
- 鉴权：是
- 权限：
  - `admin` 检索全部向量
  - `user` 仅检索本人向量

请求体：

```json
{
  "query": "扭矩异常",
  "limit": 5
}
```

## 企业级 RAG

### 数据处理

- 文本按语义切分，默认 `300~500` 字符
- 自动提取结构化字段：`problem`、`root_cause`、`solution`
- PostgreSQL 存案例正文与 `metadata(product / problem_type / process)`
- Chroma 存分块文本与 `embedding`

### 检索流程

1. embedding 查询
2. Top10 chunk 召回
3. metadata 过滤，优先同产品 + 同问题类型，工序作为补充
4. rerank 排序
5. 聚合同案例后选 Top3

### 生成流程

1. 提取历史案例
2. 先总结写作风格
3. 再生成 8D JSON

### 写作风格学习

- 输入历史报告
- 抽取用词
- 抽取句式
- 抽取专业术语
- 同时生成反模板规则，显式避免 AI 套话
- 在 `/api/rag/generate` 中可自动应用最新风格，或通过 `styleProfileId` 指定风格

### RAG API

#### 1) 导入案例文档（管理员）

- `POST /api/rag/cases/upload`
- 鉴权：是
- 权限：`admin`
- 请求：`multipart/form-data`，字段名 `files`

#### 2) 批量导入文件夹（管理员）

- `POST /api/rag/cases/import-folder`
- 鉴权：是
- 权限：`admin`

请求体：

```json
{
  "folderPath": "rag-cases",
  "recursive": true
}
```

#### 3) 检索案例

- `POST /api/rag/search`
- 鉴权：是
- 权限：`admin` / `user`

请求体：

```json
{
  "query": "装配工序中某型号控制器终检发现扭矩不足，怀疑电批校准漂移",
  "product": "某型号控制器",
  "problemType": "扭矩不足",
  "process": "装配"
}
```

返回包含：

- `query_profile`
- `pipeline`
- `items`

#### 4) 基于 RAG 生成 8D

- `POST /api/rag/generate`
- 鉴权：是
- 权限：`admin` / `user`

请求体：

```json
{
  "title": "控制器装配扭矩异常",
  "styleProfileId": "optional-style-profile-uuid",
  "styleSummary": "optional-style-summary",
  "product": "某型号控制器",
  "problemType": "扭矩不足",
  "process": "装配",
  "problemStatement": "终检发现锁附扭矩不足，近24小时内出现17台",
  "impact": "返工增加且存在客户退货风险",
  "rootCauseHint": "怀疑新批次电批校准偏移",
  "teamMembers": ["QE", "PE", "ME"],
  "retrievedCases": [
    {
      "id": "case-001",
      "title": "历史扭矩异常案例",
      "problem": "终检发现锁附扭矩偏低",
      "root_cause": "电批校准漂移",
      "solution": "校准电批并增加首件确认",
      "matched_chunks": [
        "问题集中发生于夜班末段，设备输出扭矩波动超设定上限。",
        "临时措施为停用涉事电批并复核当班产品。"
      ]
    }
  ]
}
```

说明（新增）：

- 检索采用混合召回：`embedding` + `TF-IDF` 关键词检索融合。
- 可选参数：
  - `retrievalOptions.tfidfRecallLimit`（默认 `30`）
  - `retrievalOptions.hybridEmbeddingWeight`（默认 `0.65`）
  - `retrievalOptions.hybridTfidfWeight`（默认 `0.35`）
- 生成采用分步策略：先 D2（问题描述）→ 再 D4（原因分析）→ 再 D5（纠正措施），最后生成完整 8D JSON 并对 D2/D4/D5 做一致性约束。

返回包含：

- `generation_log_id`（用于后续评分）
- `references`
- `style_profile`
- `style_summary`
- `report`
- `report_text`

`report` 为结构化 JSON，包含完整 D1-D8、`five_why_analysis`、`historical_case_application`、`next_actions`；`report_text` 为可直接展示或导出的文本版 8D。

#### 4.1) 查询 AI 生成日志（调试/优化）

- `GET /api/rag/logs`
- 鉴权：是
- 权限：`admin` / `user`

查询参数：

- `limit`：每页条数，默认 `20`，最大 `100`
- `offset`：偏移量，默认 `0`
- `scene`：场景过滤（默认场景为 `rag_generation`）
- `status`：`success` / `failed`
- `from`：起始时间（ISO datetime）
- `to`：结束时间（ISO datetime）
- `keyword`：关键词（会在 `user_input` / `retrieval_content` / `prompt_content` / `ai_output` / `report_text` / `error_message` 中模糊匹配）
- `minDurationMs`：最小时延（毫秒）
- `maxDurationMs`：最大时延（毫秒）

返回字段：

- `total`：总记录数
- `limit`
- `offset`
- `items`：日志列表（包含 `user_input`、`retrieval_content`、`prompt_content`、`ai_output`、`duration_ms` 等）

#### 4.2) 提交 RAG 结果评分

- `POST /api/rag/evaluations`
- 鉴权：是
- 权限：`admin` / `user`

请求体：

```json
{
  "generationLogId": "d7f64a8f-6b0f-4d54-9fe8-d0a8aa9e9e0a",
  "rating": "good",
  "comment": "案例命中准确，措施建议可直接落地。"
}
```

字段说明：

- `generationLogId`：`/api/rag/generate` 返回的 `generation_log_id`
- `rating`：`good` / `normal` / `bad`（对应 好 / 一般 / 差）
- `comment`：可选备注

说明：

- 同一用户对同一 `generationLogId` 重复提交会执行更新（upsert）。

#### 4.3) RAG 评估统计

- `GET /api/rag/evaluations/stats`
- 鉴权：是
- 权限：`admin` / `user`

查询参数：

- `scene`：默认 `rag_generation`
- `from`：起始时间（ISO datetime）
- `to`：结束时间（ISO datetime）
- `limit`：明细分页条数，默认 `20`，最大 `100`
- `offset`：明细偏移量，默认 `0`

返回包含：

- `metrics.total_generated`：生成总数
- `metrics.total_success`：成功生成数
- `metrics.total_hit`：命中数（`retrieval_content` 非空）
- `metrics.hit_rate`：命中率（`total_hit / total_success`）
- `metrics.total_rated`：已评分数
- `metrics.rating_distribution`：评分分布
- `metrics.satisfaction_rate`：用户满意度（`good / total_rated`）
- `items`：按时间倒序的评估明细

#### 5) 学习写作风格（管理员）

- `POST /api/rag/style-profiles`
- 鉴权：是
- 权限：`admin`

请求体：

```json
{
  "name": "质量部资深工程师风格",
  "description": "学习历史8D和异常分析报告的写法",
  "reports": [
    {
      "title": "扭矩异常8D",
      "content": "终检发现3批次锁附扭矩偏低，问题主要集中在A线夜班。经现场复核，设备输出存在波动..."
    },
    {
      "title": "焊接虚焊分析",
      "content": "客户退回样件拆解后确认焊点润湿不足，虚焊位置集中于左侧端子..."
    }
  ]
}
```

返回将包含结构化风格画像：

- `lexicon`
- `sentence_patterns`
- `technical_terms`
- `style_rules`
- `anti_template_rules`
- `sample_phrases`

也支持直接上传历史报告文件学习风格：

- `POST /api/rag/style-profiles/upload`
- 鉴权：是
- 权限：`admin`
- 请求：`multipart/form-data`
- 文件字段：`files`
- 额外表单字段：`name`、`description`

#### 6) 查看风格画像

- `GET /api/rag/style-profiles`
- `GET /api/rag/style-profiles/latest`
- `GET /api/rag/style-profiles/:profileId`

## 常见错误码

- `400` 参数错误
- `401` 未登录或 Token 无效
- `403` 权限不足
- `409` 资源冲突（如邮箱已存在）
- `500` 服务端错误
