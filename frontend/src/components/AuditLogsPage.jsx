import { useState } from "react";

function toJsonText(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch (_error) {
    return "{}";
  }
}

export default function AuditLogsPage({ loading, data, onSearch, onExportCsv }) {
  const [action, setAction] = useState("");
  const [status, setStatus] = useState("");
  const items = Array.isArray(data?.items) ? data.items : [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-stone-900">审计日志</h2>
          <p className="text-sm text-stone-500">关键管理与业务动作追踪</p>
        </div>
        <button
          type="button"
          onClick={onExportCsv}
          className="rounded-xl bg-stone-900 px-3 py-2 text-sm text-white hover:bg-stone-800"
        >
          导出 CSV
        </button>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="action"
            className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
          >
            <option value="">全部状态</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
          </select>
          <button
            type="button"
            onClick={() => onSearch({ action, status })}
            className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700"
          >
            查询
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        {loading ? (
          <p className="text-sm text-stone-500">加载中...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500">
                  <th className="px-2 py-2">时间</th>
                  <th className="px-2 py-2">动作</th>
                  <th className="px-2 py-2">状态</th>
                  <th className="px-2 py-2">资源</th>
                  <th className="px-2 py-2">操作者</th>
                  <th className="px-2 py-2">详情</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-stone-100 align-top">
                    <td className="px-2 py-2 text-stone-700">{String(item.created_at).replace("T", " ").slice(0, 19)}</td>
                    <td className="px-2 py-2 text-stone-900">{item.action}</td>
                    <td className="px-2 py-2 text-stone-900">{item.status}</td>
                    <td className="px-2 py-2 text-stone-900">{item.resource_type}:{item.resource_id}</td>
                    <td className="px-2 py-2 text-stone-900">{item.actor_id || "-"}</td>
                    <td className="px-2 py-2">
                      <pre className="max-w-[420px] whitespace-pre-wrap break-all text-xs text-stone-600">
                        {toJsonText(item.detail)}
                      </pre>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-stone-500">
                      暂无数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
