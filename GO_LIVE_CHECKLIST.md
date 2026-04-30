# Go-Live Checklist

## A. 变更冻结与备份

- [ ] 代码已合并到发布分支（`main/master`）并打 tag。
- [ ] 数据库已完成发布前备份。
- [ ] 回滚镜像/tag 已确认可用。
- [ ] 变更窗口与负责人（开发/运维/业务）已确认。

## B. 环境变量与密钥

- [ ] `JWT_SECRET` 已配置且长度 >= 32。
- [ ] `CORS_ORIGIN` 已配置为生产域名（不是 `*`）。
- [ ] `METRICS_TOKEN` 已配置。
- [ ] `deploy/monitoring/secrets/metrics_token` 已生成。
- [ ] OpenAI 与数据库凭据已配置且最小权限化。

## C. 部署执行

- [ ] 执行：`docker compose --profile prod --profile monitoring up -d --build`
- [ ] `migrator` 容器执行成功。
- [ ] `backend` / `worker` / `frontend` / `postgres` / `redis` / `chroma` / `prometheus` 均为 healthy/up。

## D. 功能与链路验收

- [ ] 健康检查：`GET /api/health` 返回 `database/redis/chroma = ok`。
- [ ] 冒烟测试通过：`npm run smoke`。
- [ ] 集成测试通过：`npm run test:integration`。
- [ ] 关键业务接口抽样成功（登录、RAG 检索、RAG 生成、日志查询）。

## E. 监控与告警验收

- [ ] Prometheus 可抓取 `backend:8080/metrics`。
- [ ] 公网访问 `/metrics` 被边缘层拒绝（403）。
- [ ] 5xx 告警规则已加载并可见。
- [ ] 延迟与流量告警规则已加载并可见。

## F. 安全验收

- [ ] 认证接口限流生效（登录连续请求触发 429）。
- [ ] 全局限流生效（高频请求触发 429）。
- [ ] 管理接口权限校验正确（非 admin 访问被拒绝）。
- [ ] 上传接口文件大小与数量限制生效。

## G. 回滚演练（至少一次）

- [ ] 已验证回滚命令可执行。
- [ ] 回滚后 `health + smoke` 恢复正常。
- [ ] 数据恢复流程已验证（备份->恢复）。

## H. 发布完成标准（全部满足）

- [ ] 过去 30 分钟无持续 5xx 告警。
- [ ] 平均延迟在可接受阈值内。
- [ ] 业务方验收通过。
- [ ] 发布记录与变更单已归档。
