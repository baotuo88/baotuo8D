import { useEffect, useMemo, useState } from "react";

const STEP_DEFS = [
  { key: "d1", label: "D1 团队组建", hint: "界定团队、职责和跨部门参与方。" },
  { key: "d2", label: "D2 问题描述", hint: "描述问题现象、范围、影响和时间。" },
  { key: "d3", label: "D3 临时围堵", hint: "记录已采取的临时遏制措施。" },
  { key: "d4", label: "D4 根因分析", hint: "写明原因链路和分析结论。" },
  { key: "d5", label: "D5 永久对策", hint: "定义纠正措施和责任分工。" },
  { key: "d6", label: "D6 实施验证", hint: "记录实施结果和验证结论。" },
  { key: "d7", label: "D7 防再发生", hint: "沉淀标准化和预防动作。" },
  { key: "d8", label: "D8 团队表彰", hint: "形成结案说明与经验复盘。" }
];

function statusLabel(status) {
  if (status === "review") {
    return "评审中";
  }
  if (status === "closed") {
    return "已关闭";
  }
  return "草稿";
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function canEdit(report, currentUser) {
  if (!report || !currentUser) {
    return false;
  }

  if (report.status === "closed") {
    return false;
  }

  if (currentUser.role === "admin") {
    return true;
  }

  return report.creator?.id === currentUser.id && report.status === "draft";
}

export default function EightDDetailPage({
  report,
  loading,
  currentStep,
  currentUser,
  onNavigateStep,
  onBack,
  onSaveTitle,
  onSaveStep,
  onSubmitReview,
  onApproval
}) {
  const [titleDraft, setTitleDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const currentStepDef = useMemo(
    () => STEP_DEFS.find((item) => item.key === currentStep) || STEP_DEFS[0],
    [currentStep]
  );

  useEffect(() => {
    setTitleDraft(report?.title || "");
  }, [report?.title]);

  useEffect(() => {
    if (!report) {
      setContentDraft("");
      return;
    }

    setContentDraft(report[currentStepDef.key] || "");
  }, [report, currentStepDef.key]);

  const editable = canEdit(report, currentUser);
  const canReview = report && (currentUser?.role === "admin" || report.creator?.id === currentUser?.id);
  const showApprove = report?.status === "review" && currentUser?.role === "admin";

  async function handleSaveTitle() {
    if (!report || !editable) {
      return;
    }

    setSaving(true);
    setActionMessage("");

    try {
      await onSaveTitle(report.id, titleDraft);
      setActionMessage("标题已保存。");
    } catch (error) {
      setActionMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveStep() {
    if (!report || !editable) {
      return;
    }

    setSaving(true);
    setActionMessage("");

    try {
      await onSaveStep(report.id, currentStepDef.key, contentDraft);
      setActionMessage(`${currentStepDef.label} 已保存。`);
    } catch (error) {
      setActionMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitReview() {
    if (!report) {
      return;
    }

    setSaving(true);
    setActionMessage("");

    try {
      await onSubmitReview(report.id, "review", "前端提交评审");
      setActionMessage("已提交评审。");
    } catch (error) {
      setActionMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(decision) {
    if (!report) {
      return;
    }

    setSaving(true);
    setActionMessage("");

    try {
      await onApproval(report.id, decision, decision === "approved" ? "通过" : "退回修改");
      setActionMessage(decision === "approved" ? "已审批通过。" : "已退回草稿。");
    } catch (error) {
      setActionMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-[28px] border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-[0_1px_0_rgba(28,25,23,0.03)]">
        正在加载 8D 详情...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-[28px] border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-[0_1px_0_rgba(28,25,23,0.03)]">
        未找到该 8D 报告。
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="rounded-[28px] border border-stone-200 bg-[#fbfaf8] p-4 shadow-[0_1px_0_rgba(28,25,23,0.03)]">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 transition hover:text-stone-900"
        >
          ← 返回列表
        </button>

        <div className="mb-5 border-b border-stone-200 pb-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-stone-400">Step Navigator</p>
          <h2 className="mt-2 font-serif text-xl tracking-tight text-stone-900">{report.title}</h2>
          <p className="mt-2 text-sm text-stone-500">状态：{statusLabel(report.status)}</p>
        </div>

        <div className="space-y-1.5">
          {STEP_DEFS.map((step) => (
            <button
              key={step.key}
              type="button"
              onClick={() => onNavigateStep(step.key)}
              className={`w-full rounded-2xl px-3 py-3 text-left transition ${
                currentStepDef.key === step.key
                  ? "bg-white text-stone-900 shadow-[0_1px_0_rgba(28,25,23,0.04)]"
                  : "text-stone-500 hover:bg-white/80 hover:text-stone-900"
              }`}
            >
              <p className="text-sm font-medium">{step.label}</p>
              <p className="mt-1 text-xs leading-5 text-stone-400">{step.hint}</p>
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-4">
        <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_1px_0_rgba(28,25,23,0.03)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-stone-400">Metadata</p>
              <input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                disabled={!editable}
                className="mt-3 w-full rounded-2xl border border-stone-200 bg-[#fcfbf8] px-4 py-3 font-serif text-3xl tracking-tight text-stone-900 outline-none transition focus:border-stone-400 disabled:cursor-not-allowed disabled:bg-stone-100"
              />
            </div>

            <div className="grid min-w-[240px] gap-2 rounded-2xl bg-[#f7f6f3] p-4 text-sm text-stone-600">
              <div className="flex items-center justify-between gap-3">
                <span>创建人</span>
                <span>{report.creator?.name || "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>创建时间</span>
                <span>{formatDate(report.timestamps?.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>最后更新</span>
                <span>{formatDate(report.timestamps?.updatedAt)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!editable || saving}
              onClick={handleSaveTitle}
              className="rounded-2xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:text-stone-900 disabled:opacity-50"
            >
              保存标题
            </button>
            {report.status === "draft" && canReview && (
              <button
                type="button"
                disabled={saving}
                onClick={handleSubmitReview}
                className="rounded-2xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
              >
                提交评审
              </button>
            )}
            {showApprove && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleApprove("approved")}
                  className="rounded-2xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
                >
                  审批通过
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleApprove("rejected")}
                  className="rounded-2xl bg-rose-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-600"
                >
                  退回草稿
                </button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-stone-200 bg-white shadow-[0_1px_0_rgba(28,25,23,0.03)]">
          <div className="border-b border-stone-200 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-stone-400">Editing</p>
            <h3 className="mt-2 font-serif text-2xl tracking-tight text-stone-900">
              {currentStepDef.label}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-500">{currentStepDef.hint}</p>
          </div>

          <div className="px-5 py-5">
            <textarea
              value={contentDraft}
              onChange={(event) => setContentDraft(event.target.value)}
              disabled={!editable}
              rows={18}
              className="w-full rounded-[24px] border border-stone-200 bg-[#fcfbf8] px-5 py-5 text-sm leading-7 text-stone-800 outline-none transition focus:border-stone-400 disabled:cursor-not-allowed disabled:bg-stone-100"
              placeholder="在此编写该步骤内容..."
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!editable || saving}
                onClick={handleSaveStep}
                className="rounded-2xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                保存当前步骤
              </button>
              {actionMessage && <span className="text-sm text-stone-500">{actionMessage}</span>}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_1px_0_rgba(28,25,23,0.03)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-stone-400">Status History</p>
            <div className="mt-4 space-y-3">
              {(report.statusHistory || []).length === 0 ? (
                <p className="text-sm text-stone-500">暂无状态流转记录。</p>
              ) : (
                report.statusHistory.map((item) => (
                  <article key={item.id} className="rounded-2xl bg-[#f7f6f3] p-4 text-sm text-stone-600">
                    <p className="font-medium text-stone-900">
                      {item.fromStatus} → {item.toStatus}
                    </p>
                    <p className="mt-2 leading-6">{item.comment || "无备注"}</p>
                    <p className="mt-2 text-xs text-stone-400">
                      {item.actor?.name} · {formatDate(item.createdAt)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_1px_0_rgba(28,25,23,0.03)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-stone-400">Approvals</p>
            <div className="mt-4 space-y-3">
              {(report.approvals || []).length === 0 ? (
                <p className="text-sm text-stone-500">暂无审批记录。</p>
              ) : (
                report.approvals.map((item) => (
                  <article key={item.id} className="rounded-2xl bg-[#f7f6f3] p-4 text-sm text-stone-600">
                    <p className="font-medium text-stone-900">{item.decision}</p>
                    <p className="mt-2 leading-6">{item.comment || "无备注"}</p>
                    <p className="mt-2 text-xs text-stone-400">
                      {item.actor?.name} · {formatDate(item.createdAt)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
