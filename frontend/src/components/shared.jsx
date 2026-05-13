export function statusLabel(status) {
  if (status === "review") {
    return "评审中";
  }
  if (status === "closed") {
    return "已关闭";
  }
  return "草稿";
}

export function StatusBadge({ status }) {
  const label = statusLabel(status);
  const styles = {
    draft: "bg-slate-100 text-slate-700",
    review: "bg-amber-100 text-amber-800",
    closed: "bg-emerald-100 text-emerald-800"
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || styles.draft}`}>
      {label}
    </span>
  );
}

export function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

export function Field({ label, children, hint }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}
