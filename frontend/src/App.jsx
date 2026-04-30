import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import AuthPage from "./components/AuthPage";
import AiConfigPage from "./components/AiConfigPage";
import EightDDetailPage from "./components/EightDDetailPage";
import EightDListPage from "./components/EightDListPage";
import GenerateModal from "./components/GenerateModal";
import { apiRequest, getStoredSession, setStoredSession, clearStoredSession } from "./lib/api";

function parseRoute() {
  const hash = window.location.hash.replace(/^#/, "") || "/reports";
  const [path, queryString = ""] = hash.split("?");
  const params = new URLSearchParams(queryString);

  if (path === "/ai-config") {
    return { page: "ai-config" };
  }

  const match = path.match(/^\/reports\/([^/]+)$/);
  if (match) {
    return {
      page: "report-detail",
      reportId: match[1],
      step: params.get("step") || "d1"
    };
  }

  return { page: "report-list" };
}

function isAdmin(user) {
  return user?.role === "admin";
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

  useEffect(() => {
    if (!token) {
      return;
    }

    if (route.page === "report-list") {
      loadReports();
      return;
    }

    if (route.page === "report-detail") {
      loadReportDetail(route.reportId);
      return;
    }

    if (route.page === "ai-config") {
      loadAiConfig();
    }
  }, [token, route.page, route.reportId]);

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
      ...(selectedReport
        ? [{ key: "report-detail", label: "当前报告", href: `/reports/${selectedReport.id}` }]
        : []),
      ...(isAdmin(currentUser)
        ? [{ key: "ai-config", label: "AI 配置", href: "/ai-config" }]
        : [])
    ],
    [selectedReport, currentUser]
  );

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f6f3] text-sm text-stone-500">正在校验登录状态...</div>;
  }

  if (!session?.token || !currentUser) {
    return <AuthPage onLogin={handleLogin} onRegister={handleRegister} />;
  }

  return (
    <>
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
            onChangeStatusFilter={(value) => {
              setStatusFilter(value);
              loadReports(value);
            }}
            onCreateReport={handleCreateReport}
            onSelectReport={(reportId) => {
              window.location.hash = `/reports/${reportId}`;
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
          />
        )}
      </AppShell>

      <GenerateModal
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        onGenerate={handleGenerateReport}
      />
    </>
  );
}
