import { useEffect, useMemo, useState } from "react";
import AiConfigPage from "./components/AiConfigPage";
import AppShell from "./components/AppShell";
import AuditLogsPage from "./components/AuditLogsPage";
import AuthPage from "./components/AuthPage";
import EightDCreatePage from "./components/EightDCreatePage";
import EightDDetailPage from "./components/EightDDetailPage";
import EightDListPage from "./components/EightDListPage";
import ErrorBoundary from "./components/ErrorBoundary";
import GenerateModal from "./components/GenerateModal";
import RagMetricsPage from "./components/RagMetricsPage";
import { apiRequest, clearStoredSession, getStoredSession, setStoredSession } from "./lib/api";

function parseRoute() {
  const hash = window.location.hash.replace(/^#/, "") || "/reports";
  const [path, queryString = ""] = hash.split("?");
  const params = new URLSearchParams(queryString);

  if (path === "/ai-config") {
    return { page: "ai-config" };
  }
  if (path === "/rag-metrics") {
    return { page: "rag-metrics" };
  }
  if (path === "/audit-logs") {
    return { page: "audit-logs" };
  }

  if (path === "/reports/new") {
    return { page: "report-create" };
  }

  const match = path.match(/^\/reports\/([^/]+)$/);
  if (match) {
    return {
      page: "report-detail",
      reportId: match[1],
      step: params.get("step") || "d1"
    };
  }

  if (path === "/reports") {
    const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
    return {
      page: "report-list",
      listState: {
        status: params.get("status") || "",
        query: params.get("q") || "",
        sortBy: params.get("sort") || "updated_desc",
        creator: params.get("creator") || "",
        createdFrom: params.get("from") || "",
        createdTo: params.get("to") || "",
        page
      }
    };
  }

  return {
    page: "report-list",
    listState: {
      status: "",
      query: "",
      sortBy: "updated_desc",
      creator: "",
      createdFrom: "",
      createdTo: "",
      page: 1
    }
  };
}

function isAdmin(user) {
  return user?.role === "admin";
}

function downloadCsv(fileName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((key) => {
          const raw = row[key] ?? "";
          const escaped = String(raw).replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(",")
    )
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  const [session, setSession] = useState(() => getStoredSession());
  const [authLoading, setAuthLoading] = useState(Boolean(getStoredSession()?.token));
  const [appError, setAppError] = useState("");
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState(null);
  const [aiConfigLoading, setAiConfigLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [ragMetrics, setRagMetrics] = useState(null);
  const [ragMetricsLoading, setRagMetricsLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState(null);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);

  const token = session?.token || "";
  const currentUser = session?.user || null;

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseRoute());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!token) {
      setAuthLoading(false);
      return;
    }

    let active = true;

    async function bootstrap() {
      try {
        setAuthLoading(true);
        const result = await apiRequest("/auth/me", { token });
        if (!active) {
          return;
        }

        const nextSession = {
          token,
          user: result.data
        };
        setSession(nextSession);
        setStoredSession(nextSession);
      } catch (_error) {
        if (!active) {
          return;
        }

        clearStoredSession();
        setSession(null);
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, [token]);

  async function loadReports(nextStatus = statusFilter) {
    if (!token) {
      return;
    }

    try {
      setReportsLoading(true);
      setAppError("");
      const query = new URLSearchParams();
      if (nextStatus) {
        query.set("status", nextStatus);
      }
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const result = await apiRequest(`/8d-reports${suffix}`, { token });
      setReports(result.data || []);
    } catch (error) {
      setAppError(error.message);
    } finally {
      setReportsLoading(false);
    }
  }

  async function loadReportDetail(reportId) {
    if (!token || !reportId) {
      return;
    }

    try {
      setDetailLoading(true);
      setAppError("");
      const [reportResult, historyResult, approvalsResult] = await Promise.all([
        apiRequest(`/8d-reports/${reportId}`, { token }),
        apiRequest(`/8d-reports/${reportId}/status-history`, { token }).catch(() => ({ data: [] })),
        apiRequest(`/8d-reports/${reportId}/approvals`, { token }).catch(() => ({ data: [] }))
      ]);

      setSelectedReport({
        ...reportResult.data,
        statusHistory: historyResult.data || [],
        approvals: approvalsResult.data || []
      });
    } catch (error) {
      setAppError(error.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadAiConfig() {
    if (!token || !isAdmin(currentUser)) {
      return;
    }

    try {
      setAiConfigLoading(true);
      setAppError("");
      const result = await apiRequest("/ai-config", { token });
      setAiConfig(result.data);
    } catch (error) {
      setAppError(error.message);
    } finally {
      setAiConfigLoading(false);
    }
  }

  async function loadRagMetrics(query = {}) {
    if (!token) {
      return;
    }

    try {
      setRagMetricsLoading(true);
      const params = new URLSearchParams(query);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const result = await apiRequest(`/rag/metrics${suffix}`, { token });
      setRagMetrics(result.data);
    } catch (error) {
      setAppError(error.message);
    } finally {
      setRagMetricsLoading(false);
    }
  }

  async function loadAuditLogs(query = {}) {
    if (!token || !isAdmin(currentUser)) {
      return;
    }

    try {
      setAuditLogsLoading(true);
      const params = new URLSearchParams(query);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const result = await apiRequest(`/audit/logs${suffix}`, { token });
      setAuditLogs(result.data);
    } catch (error) {
      setAppError(error.message);
    } finally {
      setAuditLogsLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      return;
    }

    if (route.page === "report-list") {
      const nextStatus = route.listState?.status || "";
      setStatusFilter(nextStatus);
      loadReports(nextStatus);
      return;
    }

    if (route.page === "report-detail") {
      loadReportDetail(route.reportId);
      return;
    }

    if (route.page === "ai-config") {
      loadAiConfig();
      return;
    }

    if (route.page === "rag-metrics") {
      loadRagMetrics();
      return;
    }

    if (route.page === "audit-logs") {
      loadAuditLogs();
    }
  }, [token, route.page, route.reportId, route.listState?.status]);

  async function handleLogin(payload) {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: payload
    });

    const nextSession = {
      token: result.data.token,
      user: result.data.user
    };

    setSession(nextSession);
    setStoredSession(nextSession);
    window.location.hash = "/reports";
  }

  async function handleRegister(payload) {
    const result = await apiRequest("/auth/register", {
      method: "POST",
      body: payload
    });

    const nextSession = {
      token: result.data.token,
      user: result.data.user
    };

    setSession(nextSession);
    setStoredSession(nextSession);
    window.location.hash = "/reports";
  }

  function handleLogout() {
    clearStoredSession();
    setSession(null);
    setReports([]);
    setSelectedReport(null);
    setAiConfig(null);
    setRagMetrics(null);
    setAuditLogs(null);
    window.location.hash = "/reports";
  }

  async function handleCreateReport(payload) {
    await apiRequest("/8d-reports", {
      method: "POST",
      token,
      body: payload
    });
    await loadReports();
  }

  async function handleSaveTitle(reportId, title) {
    const result = await apiRequest(`/8d-reports/${reportId}`, {
      method: "PATCH",
      token,
      body: { title }
    });

    setSelectedReport((prev) =>
      prev && prev.id === reportId ? { ...prev, ...result.data } : prev
    );
    setReports((prev) => prev.map((item) => (item.id === reportId ? result.data : item)));
  }

  async function handleSaveStep(reportId, step, content) {
    const result = await apiRequest(`/8d-reports/${reportId}/steps/${step}`, {
      method: "PATCH",
      token,
      body: { content }
    });

    setSelectedReport((prev) =>
      prev && prev.id === reportId
        ? { ...prev, ...result.data, statusHistory: prev.statusHistory, approvals: prev.approvals }
        : prev
    );
    setReports((prev) => prev.map((item) => (item.id === reportId ? result.data : item)));
  }

  async function handleStatusChange(reportId, status, comment = "") {
    const result = await apiRequest(`/8d-reports/${reportId}/status`, {
      method: "PATCH",
      token,
      body: { status, comment }
    });

    await loadReports();
    await loadReportDetail(reportId);
    return result.data;
  }

  async function handleApproval(reportId, decision, comment = "") {
    const result = await apiRequest(`/8d-reports/${reportId}/approvals`, {
      method: "POST",
      token,
      body: { decision, comment }
    });

    await loadReports();
    await loadReportDetail(reportId);
    return result.data;
  }

  async function handleSaveAiConfig(payload) {
    const result = await apiRequest("/ai-config", {
      method: "PUT",
      token,
      body: payload
    });

    setAiConfig(result.data);
    return result.data;
  }

  async function handleTestAiConfig(payload) {
    const result = await apiRequest("/ai-config/test", {
      method: "POST",
      token,
      body: payload
    });

    return result.data;
  }

  async function handleGenerateReport(payload) {
    const result = await apiRequest("/rag/generate", {
      method: "POST",
      token,
      body: payload
    });

    return result.data;
  }

  const navigation = useMemo(
    () => [
      { key: "report-list", label: "8D 列表", href: "/reports" },
      { key: "rag-metrics", label: "RAG 指标", href: "/rag-metrics" },
      ...(selectedReport
        ? [{ key: "report-detail", label: "当前报告", href: `/reports/${selectedReport.id}` }]
        : []),
      ...(isAdmin(currentUser)
        ? [
            { key: "ai-config", label: "AI 配置", href: "/ai-config" },
            { key: "audit-logs", label: "审计日志", href: "/audit-logs" }
          ]
        : [])
    ],
    [selectedReport, currentUser]
  );

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">正在校验登录状态...</div>;
  }

  if (!session?.token || !currentUser) {
    return <AuthPage onLogin={handleLogin} onRegister={handleRegister} />;
  }

  return (
    <ErrorBoundary>
      <AppShell
        currentUser={currentUser}
        route={route}
        navigation={navigation}
        onNavigate={(href) => {
          window.location.hash = href;
        }}
        onOpenGenerator={() => setGeneratorOpen(true)}
        onLogout={handleLogout}
        errorMessage={appError}
      >
        {route.page === "report-list" && (
          <EightDListPage
            reports={reports}
            loading={reportsLoading}
            statusFilter={statusFilter}
            initialListState={route.listState}
            onChangeStatusFilter={(value) => {
              setStatusFilter(value);
              loadReports(value);
            }}
            onCreateNew={() => {
              window.location.hash = "/reports/new";
            }}
            onSelectReport={(reportId) => {
              window.location.hash = `/reports/${reportId}`;
            }}
          />
        )}

        {route.page === "report-create" && (
          <EightDCreatePage
            onCreateReport={handleCreateReport}
            onCancel={() => {
              window.location.hash = "/reports";
            }}
          />
        )}

        {route.page === "report-detail" && (
          <EightDDetailPage
            report={selectedReport}
            loading={detailLoading}
            currentStep={route.step}
            currentUser={currentUser}
            onNavigateStep={(step) => {
              window.location.hash = `/reports/${route.reportId}?step=${step}`;
            }}
            onBack={() => {
              window.location.hash = "/reports";
            }}
            onSaveTitle={handleSaveTitle}
            onSaveStep={handleSaveStep}
            onSubmitReview={handleStatusChange}
            onApproval={handleApproval}
          />
        )}

        {route.page === "ai-config" && isAdmin(currentUser) && (
          <AiConfigPage
            config={aiConfig}
            loading={aiConfigLoading}
            onReload={loadAiConfig}
            onSave={handleSaveAiConfig}
            onTest={handleTestAiConfig}
          />
        )}

        {route.page === "rag-metrics" && (
          <RagMetricsPage
            loading={ragMetricsLoading}
            data={ragMetrics}
            onRefresh={() => loadRagMetrics()}
            onExportCsv={() => {
              const rows = (ragMetrics?.trends || []).map((item) => ({
                day: String(item.day).slice(0, 10),
                total: item.total,
                success: item.success,
                avg_duration_ms: item.avg_duration_ms
              }));
              downloadCsv("rag-metrics-trends.csv", rows);
            }}
          />
        )}

        {route.page === "audit-logs" && isAdmin(currentUser) && (
          <AuditLogsPage
            loading={auditLogsLoading}
            data={auditLogs}
            onSearch={(query) => loadAuditLogs(query)}
            onExportCsv={() => {
              const rows = (auditLogs?.items || []).map((item) => ({
                created_at: item.created_at,
                action: item.action,
                status: item.status,
                resource_type: item.resource_type,
                resource_id: item.resource_id,
                actor_id: item.actor_id || "",
                actor_role: item.actor_role || "",
                ip: item.ip || ""
              }));
              downloadCsv("audit-logs.csv", rows);
            }}
          />
        )}
      </AppShell>

      <GenerateModal
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        onGenerate={handleGenerateReport}
      />
    </ErrorBoundary>
  );
}
