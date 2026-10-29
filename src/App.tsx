import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  Filter,
  GitBranch,
  GitPullRequest,
  GitFork,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Network,
  Plus,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  TriangleAlert,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { api } from "./api";
import type {
  Category,
  Finding,
  Job,
  Repository,
  Severity,
  View,
  Workspace,
  Session,
} from "./types";
import Graph from "./Graph";
import Login from "./Login";
import "./App.css";

const navigation: {
  title?: string;
  items: { label: View; icon: LucideIcon }[];
}[] = [
  {
    items: [
      { label: "Overview", icon: LayoutDashboard },
      { label: "Repositories", icon: Box },
      { label: "Architecture", icon: Network },
    ],
  },
  {
    title: "INTELLIGENCE",
    items: [
      { label: "Code reviews", icon: GitPullRequest },
      { label: "Security", icon: Shield },
      { label: "Performance", icon: Activity },
    ],
  },
];
const severityOrder: Severity[] = ["critical", "high", "medium", "low"];
const severityColor = {
  critical: "#e57b78",
  high: "#d5a370",
  medium: "#c9bd78",
  low: "#829897",
};
const titles: Record<View, { title: string; subtitle: string }> = {
  Overview: {
    title: "Engineering overview",
    subtitle: "Your codebase at a glance. Every signal, a step forward.",
  },
  Repositories: {
    title: "Your repositories",
    subtitle: "Connect your code. See the bigger picture.",
  },
  Architecture: {
    title: "Architecture explorer",
    subtitle: "Follow the connections. Understand how it all fits together.",
  },
  "Code reviews": {
    title: "Code intelligence",
    subtitle: "Turn code signals into clear, actionable improvements.",
  },
  Security: {
    title: "Security overview",
    subtitle: "Find potential risks before they find their way to production.",
  },
  Performance: {
    title: "Performance insights",
    subtitle: "Spot potential bottlenecks. Build a faster foundation.",
  },
  Settings: {
    title: "Workspace settings",
    subtitle: "A little configuration. A lot more clarity.",
  },
};
const fmt = (n: number) =>
  new Intl.NumberFormat("en", {
    notation: n > 9999 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
const ago = (date: string) => {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
};
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-symbol">
        <i />
        <i />
        <i />
      </span>
      {!small && (
        <span>
          NEXORA<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`badge ${className}`}>{children}</span>;
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = `dialog-${title.replace(/\W/g, "")}`;
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={heading}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <div>
          <h2 id={heading}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function HealthChart({
  repositories,
  days,
}: {
  repositories: Repository[];
  days: number;
}) {
  const cutoff =
    Math.max(0, ...repositories.map((r) => new Date(r.analyzedAt).getTime())) -
    days * 86400000;
  const samples = new Map<string, number[]>();
  for (const repo of repositories)
    for (const point of repo.history) {
      if (new Date(point.date).getTime() < cutoff) continue;
      const localDate = new Date(point.date);
      const day = [
        localDate.getFullYear(),
        String(localDate.getMonth() + 1).padStart(2, "0"),
        String(localDate.getDate()).padStart(2, "0"),
      ].join("-");
      samples.set(day, [...(samples.get(day) || []), point.score]);
    }
  const points = [...samples]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, scores]) => ({
      day,
      score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    }));
  const x = (i: number) =>
    points.length === 1 ? 330 : 40 + (i / (points.length - 1)) * 580;
  const y = (score: number) => 195 - ((score - 40) / 60) * 155;
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.score)}`)
    .join(" ");
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="health-chart">
      <svg
        viewBox="0 0 650 235"
        role="img"
        aria-label={`Code health history with ${points.length} daily snapshots`}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#a3d877" stopOpacity=".18" />
            <stop offset="100%" stopColor="#a3d877" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[40, 60, 80, 100].map((tick) => (
          <g key={tick}>
            <text x="0" y={y(tick) + 4} fill="#6e776e" fontSize="10">
              {tick}
            </text>
            <line
              x1="32"
              y1={y(tick)}
              x2="632"
              y2={y(tick)}
              stroke="#2a2e29"
              strokeDasharray="3 5"
            />
          </g>
        ))}
        {points.length > 1 && (
          <path
            d={`${path} L${x(points.length - 1)},198 L${x(0)},198 Z`}
            fill="url(#chart-fill)"
          />
        )}
        <path
          d={path}
          fill="none"
          stroke="#b1de87"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <g
            key={p.day}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <circle
              cx={x(i)}
              cy={y(p.score)}
              r={hover === i || points.length === 1 ? 5 : 3}
              fill="#b7e38c"
              stroke="#182016"
              strokeWidth="2"
            />
            <circle cx={x(i)} cy={y(p.score)} r="16" fill="transparent" />
            <text
              x={x(i)}
              y="226"
              textAnchor="middle"
              fill="#748073"
              fontSize="10"
            >
              {new Date(`${p.day}T12:00:00`).toLocaleDateString("en", {
                month: "short",
                day: "numeric",
              })}
            </text>
            {hover === i && (
              <g>
                <rect
                  x={x(i) - 32}
                  y={y(p.score) - 34}
                  width="64"
                  height="23"
                  rx="5"
                  fill="#35422c"
                />
                <text
                  x={x(i)}
                  y={y(p.score) - 18}
                  textAnchor="middle"
                  fill="#d8e9cd"
                  fontSize="11"
                >
                  {p.score} / 100
                </text>
              </g>
            )}
          </g>
        ))}
        {!points.length && (
          <text x="330" y="120" textAnchor="middle" fill="#83907f">
            Analyze a repository to start tracking code health.
          </text>
        )}
      </svg>
      <div className="chart-foot">
        <span>
          <i /> Code health score
        </span>
        <span>
          {points.length === 1
            ? "1 snapshot · history grows with analysis"
            : `${points.length} daily snapshots`}
        </span>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("Overview");
  const [mode, setMode] = useState<"demo" | "live">(() => {
    try {
      return localStorage.getItem("nexora-mode") === "live" ? "live" : "demo";
    } catch {
      return "demo";
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [repositoryId, setRepositoryId] = useState("all");
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [repositoryInput, setRepositoryInput] = useState("");
  const [formError, setFormError] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const [toast, setToast] = useState("");
  const [detail, setDetail] = useState<
    (Finding & { repository: Repository }) | null
  >(null);
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [docsOpen, setDocsOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [review, setReview] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<"static" | "ai">("static");
  const [removeRepo, setRemoveRepo] = useState<Repository | null>(null);
  const refresh = useCallback(async () => {
    try {
      const currentSession = await api<Session>("/api/session");
      setSession(currentSession);
      if (!currentSession.authenticated) return;
      const data = await api<Workspace>("/api/workspace");
      setWorkspace(data);
      setLoadError("");
      if (data.activeJob) setJob(data.activeJob);
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);
  useEffect(() => {
    api<Session>("/api/session")
      .then(async (currentSession) => {
        setSession(currentSession);
        if (!currentSession.authenticated) return;
        const data = await api<Workspace>("/api/workspace");
        setWorkspace(data);
        if (data.activeJob) setJob(data.activeJob);
      })
      .catch((error) => setLoadError(error.message));
    const unauthorized = () => {
      setSession({ authenticated: false, authRequired: true });
      setWorkspace(null);
      setJob(null);
      setConnectOpen(false);
      setDetail(null);
      setReviewOpen(false);
    };
    window.addEventListener("nexora:unauthorized", unauthorized);
    return () =>
      window.removeEventListener("nexora:unauthorized", unauthorized);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("nexora-mode", mode);
    } catch {
      /* Browsers can disable storage. */
    }
  }, [mode]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSearch("");
        setNotifications(false);
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const activeJobId = job?.id,
    activeJobStatus = job?.status;
  useEffect(() => {
    if (!activeJobId || activeJobStatus !== "running") return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const update = await api<Job>(`/api/analyses/${activeJobId}`);
        if (stopped) return;
        setJob(update);
        if (update.status === "complete") {
          await refresh();
          setMode("live");
          setRepositoryId(update.result?.id || "all");
          setConnectOpen(false);
          setToast(
            `Analysis complete. ${update.result?.filesScanned || 0} files scanned.`,
          );
        }
        if (update.status === "failed") {
          setFormError(update.message);
          setToast(update.message);
        }
      } catch (error) {
        if (!stopped) {
          setToast((error as Error).message);
          setJob(null);
        }
      }
    }, 900);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeJobId, activeJobStatus, refresh]);

  const allRepositories =
    (mode === "demo" ? workspace?.demoRepositories : workspace?.repositories) ||
    [];
  const repositories =
    repositoryId === "all"
      ? allRepositories
      : allRepositories.filter((r) => r.id === repositoryId);
  const current = repositories[0];
  const allFindings = repositories
    .flatMap((repository) =>
      repository.findings.map((f) => ({ ...f, repository })),
    )
    .sort(
      (a, b) =>
        severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
    );
  const hasSource = repositories.some((r) => r.filesScanned > 0);
  const health = repositories.length
    ? Math.round(
        repositories.reduce((n, r) => n + r.health, 0) / repositories.length,
      )
    : 0;
  const securityScore = repositories.length
    ? Math.round(
        repositories.reduce((n, r) => n + r.securityScore, 0) /
          repositories.length,
      )
    : 0;
  const securityFindings = allFindings.filter((f) => f.category === "security");
  const performanceFindings = allFindings.filter(
    (f) => f.category === "performance",
  );
  const selectedCategory =
    view === "Security"
      ? "security"
      : view === "Performance"
        ? "performance"
        : category;
  const filteredFindings = allFindings.filter(
    (f) =>
      (severity === "all" || f.severity === severity) &&
      (selectedCategory === "all" || f.category === selectedCategory),
  );
  const running = starting || job?.status === "running";
  const searchResults = allRepositories
    .flatMap((repository) => [
      { kind: "repository" as const, title: repository.name, repository },
      ...repository.findings.map((f) => ({
        kind: "finding" as const,
        title: f.title,
        repository,
        finding: f,
      })),
    ])
    .filter((item) =>
      `${item.title} ${item.repository.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .slice(0, 6);
  function navigate(next: View) {
    setView(next);
    setSidebarOpen(false);
    setSeverity("all");
    setCategory("all");
    setSearch("");
  }
  function changeMode(next: "demo" | "live") {
    setMode(next);
    setRepositoryId("all");
    setSeverity("all");
    setCategory("all");
  }
  async function analyze(repository?: string) {
    setFormError("");
    setStarting(true);
    try {
      const next = await api<Job>("/api/analyses", {
        method: "POST",
        body: JSON.stringify(repository ? { repository } : {}),
      });
      setJob(next);
    } catch (error) {
      setFormError((error as Error).message);
      setToast((error as Error).message);
    } finally {
      setStarting(false);
    }
  }
  function runAnalysis() {
    if (current?.source === "local") void analyze();
    else if (current?.source === "github")
      void analyze(
        current.githubRepository || `${current.owner}/${current.name}`,
      );
    else setConnectOpen(true);
  }
  async function generateReview(mode: "static" | "ai" = "static") {
    setReviewMode(mode);
    setReviewOpen(true);
    setReview("");
    setReviewing(true);
    try {
      const result = await api<{ review: string }>("/api/review", {
        method: "POST",
        body: JSON.stringify({ repositoryId: current?.id, mode }),
      });
      setReview(result.review);
    } catch (error) {
      setReview((error as Error).message);
    } finally {
      setReviewing(false);
    }
  }
  function exportReport() {
    const blob = new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), mode, repositories },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `nexora-${mode}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Your analysis report has been exported.");
  }
  async function deleteRepository() {
    if (!removeRepo) return;
    try {
      await api(`/api/repositories/${encodeURIComponent(removeRepo.id)}`, {
        method: "DELETE",
      });
      setRemoveRepo(null);
      setRepositoryId("all");
      await refresh();
      setToast("Repository analysis removed. Source code was not changed.");
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  function renderRepositoryTable({ compact = false }: { compact?: boolean }) {
    return (
      <div className="table-scroll">
        <table className="repo-table">
          <thead>
            <tr>
              <th>Repository</th>
              <th>Code health</th>
              <th>Issues</th>
              {!compact && <th>Source files</th>}
              <th>Last analyzed</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {repositories.map((repo) => (
              <tr key={repo.id}>
                <td>
                  <button
                    className="repo-name"
                    onClick={() => {
                      setRepositoryId(repo.id);
                      navigate("Architecture");
                    }}
                  >
                    <span className="repo-icon">
                      <GitFork size={17} />
                    </span>
                    <span>
                      <strong>{repo.name}</strong>
                      <small>
                        <i
                          style={{
                            background: repo.languages[0]?.color || "#a7cd83",
                          }}
                        />
                        {repo.languages[0]?.name || "No source files"}
                        <span className="branch">
                          <GitBranch size={10} />
                          {repo.branch}
                        </span>
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <span className="health-score">
                    {repo.filesScanned ? repo.health : "—"}
                    <small>/100</small>
                  </span>
                  <span className="mini-progress">
                    <i style={{ width: `${repo.health}%` }} />
                  </span>
                </td>
                <td>
                  <button
                    className={`issue-pill ${repo.findings.length ? "" : "clean"}`}
                    onClick={() => {
                      setRepositoryId(repo.id);
                      navigate("Code reviews");
                    }}
                  >
                    {repo.findings.length ? (
                      <>
                        <span />
                        {repo.findings.length} issues
                      </>
                    ) : (
                      <>
                        <Check size={11} /> Clean
                      </>
                    )}
                  </button>
                </td>
                {!compact && (
                  <td className="muted">
                    {repo.filesScanned.toLocaleString()}
                  </td>
                )}
                <td className="muted time-cell">
                  <Clock3 size={12} />
                  {ago(repo.analyzedAt)}
                </td>
                <td>
                  {view === "Repositories" && repo.source !== "demo" ? (
                    <button
                      className="icon-button"
                      aria-label={`Remove ${repo.name}`}
                      onClick={() => setRemoveRepo(repo)}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : (
                    <button
                      className="icon-button"
                      aria-label={`View ${repo.name}`}
                      onClick={() => {
                        setRepositoryId(repo.id);
                        navigate("Code reviews");
                      }}
                    >
                      <ArrowUpRight size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!repositories.length && (
          <div className="empty">
            <Box size={28} />
            <h3>Your next insight starts with a repository</h3>
            <p>Import from GitHub or analyze this local workspace.</p>
            <button
              className="button primary"
              onClick={() => setConnectOpen(true)}
            >
              <Plus size={15} /> Connect repository
            </button>
          </div>
        )}
      </div>
    );
  }
  function renderFindingsTable() {
    return (
      <section className="panel findings-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Analysis findings{" "}
              <span className="count-label">{filteredFindings.length}</span>
            </h2>
            <p>
              Review signals in context. Static matches can be false positives.
            </p>
          </div>
          <div className="filter-tools">
            <Filter size={14} />
            <select
              aria-label="Filter by severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity | "all")}
            >
              <option value="all">All severities</option>
              {severityOrder.map((s) => (
                <option value={s} key={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            {view === "Code reviews" && (
              <select
                aria-label="Filter by category"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as Category | "all")
                }
              >
                <option value="all">All categories</option>
                <option value="security">Security</option>
                <option value="performance">Performance</option>
                <option value="quality">Code quality</option>
              </select>
            )}
          </div>
        </div>
        <div className="findings-list">
          {filteredFindings.map((f) => (
            <button
              className="finding-row"
              key={f.id}
              onClick={() => setDetail(f)}
            >
              <span className={`finding-icon ${f.category}`}>
                {f.category === "security" ? (
                  <Shield size={18} />
                ) : f.category === "performance" ? (
                  <Zap size={18} />
                ) : (
                  <Code2 size={18} />
                )}
              </span>
              <span className="finding-copy">
                <strong>{f.title}</strong>
                <small>
                  {f.repository.name}
                  <span>·</span>
                  {f.file}:{f.line}
                </small>
              </span>
              <Badge className={f.severity}>{f.severity}</Badge>
              <ChevronRight size={16} />
            </button>
          ))}
          {!filteredFindings.length && (
            <div className="empty">
              <ShieldCheck size={30} />
              <h3>No matching findings</h3>
              <p>
                {repositories.length
                  ? "No static-analysis signals match these filters. This does not guarantee the absence of bugs."
                  : "Connect a repository to begin analyzing your code."}
              </p>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (session && !session.authenticated)
    return (
      <Login
        onLogin={() => {
          setSession({ authenticated: true, authRequired: true });
          void refresh();
        }}
      />
    );
  if (!session && !loadError)
    return (
      <div className="loading">
        <LoaderCircle size={26} className="spin" />
        <p>Connecting to your workspace…</p>
      </div>
    );

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <Logo />
        <button
          className="workspace-switch"
          onClick={() => changeMode(mode === "demo" ? "live" : "demo")}
        >
          <span className="workspace-avatar">
            <Code2 size={17} />
          </span>
          <span>
            <strong>Engineering workspace</strong>
            <small>
              {mode === "demo" ? "Demo workspace" : "Your workspace"}
            </small>
          </span>
          <ChevronDown size={13} />
        </button>
        <nav aria-label="Main navigation">
          {navigation.map((section, i) => (
            <div className="nav-group" key={i}>
              {section.title && (
                <span className="nav-label">{section.title}</span>
              )}
              {section.items.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  className={`nav-item ${view === label ? "active" : ""}`}
                  onClick={() => navigate(label)}
                >
                  <Icon size={17} strokeWidth={1.7} />
                  <span>{label}</span>
                  {label === "Repositories" && (
                    <span className="nav-count">{allRepositories.length}</span>
                  )}
                  {label === "Security" && securityFindings.length > 0 && (
                    <span className="nav-alert" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-callout">
            <span className="callout-icon">
              <Sparkles size={18} />
            </span>
            <strong>Less noise. More clarity.</strong>
            <p>
              Your next breakthrough is
              <br />
              already in your code.
            </p>
            <button onClick={() => setConnectOpen(true)}>
              Explore your code <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={`nav-item ${view === "Settings" ? "active" : ""}`}
            onClick={() => navigate("Settings")}
          >
            <Settings2 size={17} />
            <span>Settings</span>
          </button>
          <button className="nav-item" onClick={() => setDocsOpen(true)}>
            <BookOpen size={17} />
            <span>Documentation</span>
            <ArrowUpRight size={13} />
          </button>
          <div className="sidebar-status">
            <span className={`status-dot ${loadError ? "offline" : ""}`} />
            {loadError
              ? "Engine disconnected"
              : workspace
                ? "Analysis engine online"
                : "Connecting to engine"}
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>{view}</strong>
          </div>
          <div className="topbar-right">
            <div className="global-search">
              <Search size={15} />
              <input
                ref={searchRef}
                aria-label="Search repositories and findings"
                placeholder="Search anything..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>⌘ K</kbd>
              {search && (
                <div className="search-results">
                  <div className="search-title">WORKSPACE RESULTS</div>
                  {searchResults.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSearch("");
                        setRepositoryId(item.repository.id);
                        if (item.kind === "finding")
                          setDetail({
                            ...item.finding,
                            repository: item.repository,
                          });
                        else navigate("Repositories");
                      }}
                    >
                      {item.kind === "repository" ? (
                        <Box size={15} />
                      ) : (
                        <Code2 size={15} />
                      )}
                      <span>
                        {item.title}
                        <small>
                          {item.repository.owner}/{item.repository.name}
                        </small>
                      </span>
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
                  {!searchResults.length && (
                    <p>No matching repositories or findings.</p>
                  )}
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <div className="notification-wrap">
              <button
                className="icon-button notification-button"
                aria-label="Show analysis notifications"
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={17} />
                {job && <i />}
              </button>
              {notifications && (
                <div className="notifications">
                  <strong>Activity</strong>
                  {workspace?.analysisHistory?.length ? (
                    <div className="activity-history">
                      {workspace.analysisHistory.slice(0, 6).map((item) => (
                        <p key={item.id}>
                          <Activity size={13} />
                          <span>
                            <strong>
                              {item.repository || "Local workspace"}
                            </strong>
                            {item.message}
                            <small>
                              {ago(item.completedAt || item.createdAt)}
                            </small>
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p>
                      No analyses in this session. Connect a repository to get
                      started.
                    </p>
                  )}
                  <button
                    onClick={() => {
                      setNotifications(false);
                      navigate("Repositories");
                    }}
                  >
                    View repositories <ArrowRight size={13} />
                  </button>
                </div>
              )}
            </div>
            <button
              className="user-avatar"
              aria-label="Open workspace settings"
              onClick={() => navigate("Settings")}
            >
              N
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> ENGINEERING INTELLIGENCE
              </div>
              <h1>{titles[view].title}</h1>
              <p>{titles[view].subtitle}</p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary export-button"
                onClick={exportReport}
                disabled={!repositories.length}
              >
                <Download size={14} /> Export
              </button>
              <button
                className="button primary"
                disabled={running}
                onClick={runAnalysis}
              >
                {running ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Zap size={15} />
                )}
                {running ? "Analyzing…" : "Run analysis"}
              </button>
            </div>
          </div>
          <div className="workspace-toolbar">
            <div className="workspace-tabs">
              <button
                className={mode === "demo" ? "selected" : ""}
                onClick={() => changeMode("demo")}
              >
                Demo workspace
              </button>
              <button
                className={mode === "live" ? "selected" : ""}
                onClick={() => changeMode("live")}
              >
                Your workspace
                {(workspace?.repositories.length || 0) > 0 && (
                  <span>{workspace?.repositories.length}</span>
                )}
              </button>
            </div>
            <div className="toolbar-controls">
              <select
                aria-label="Select repository"
                value={repositoryId}
                onChange={(e) => setRepositoryId(e.target.value)}
              >
                <option value="all">All repositories</option>
                {allRepositories.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <span className="toolbar-separator" />
              <select
                aria-label="History date range"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
          </div>
          {loadError && (
            <div className="error-banner">
              <TriangleAlert size={17} />
              <span>{loadError}</span>
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          )}
          {mode === "demo" && (
            <div className="demo-notice">
              <span>
                <Sparkles size={12} /> SAMPLE DATA
              </span>{" "}
              A glimpse of what’s possible. Connect a repository for real
              insights.
              <button onClick={() => setConnectOpen(true)}>
                Connect yours <ArrowRight size={12} />
              </button>
            </div>
          )}
          {job?.status === "running" && (
            <div className="analysis-progress" role="status">
              <LoaderCircle className="spin" size={15} />
              <span>{job.message}</span>
              <strong>{job.progress}%</strong>
              <i style={{ width: `${job.progress}%` }} />
            </div>
          )}
          {repositories.some((r) => r.truncated) && (
            <div className="info-note">
              <TriangleAlert size={16} />
              <p>
                Analysis limits reached. Some files or findings were omitted;
                these results are a partial snapshot. See Documentation for scan
                limits.
              </p>
            </div>
          )}
          {!workspace && !loadError ? (
            <div className="loading">
              <LoaderCircle className="spin" size={25} />
              <p>Bringing your workspace into focus…</p>
            </div>
          ) : (
            <>
              {(view === "Overview" ||
                view === "Security" ||
                view === "Performance") && (
                <div className="stats-grid">
                  {(view === "Overview"
                    ? [
                        {
                          label: "Repositories",
                          value: repositories.length,
                          icon: Box,
                          sub: `${fmt(repositories.reduce((n, r) => n + r.filesScanned, 0))} source files analyzed`,
                          trend:
                            mode === "demo"
                              ? "4 connected"
                              : `${repositories.length} connected`,
                          positive: true,
                        },
                        {
                          label: "Code health",
                          value: hasSource ? health : "—",
                          suffix: "/ 100",
                          icon: Activity,
                          sub: "Quality across your codebase",
                          trend: mode === "demo" ? "+5.2%" : "Static score",
                          positive: true,
                        },
                        {
                          label: "Active issues",
                          value: allFindings.length,
                          icon: TriangleAlert,
                          sub: `${allFindings.filter((f) => ["critical", "high"].includes(f.severity)).length} need your attention`,
                          trend:
                            mode === "demo"
                              ? "Review findings"
                              : "Potential issues",
                          positive: false,
                        },
                        {
                          label: "Security score",
                          value: hasSource ? securityScore : "—",
                          suffix: "/ 100",
                          icon: ShieldCheck,
                          sub: `${securityFindings.length} potential security findings`,
                          trend: mode === "demo" ? "+3.8%" : "Heuristic score",
                          positive: true,
                        },
                      ]
                    : [
                        {
                          label:
                            view === "Security"
                              ? "Security score"
                              : "Performance signals",
                          value:
                            view === "Security"
                              ? securityScore
                              : performanceFindings.length,
                          suffix: view === "Security" ? "/ 100" : "",
                          icon: view === "Security" ? ShieldCheck : Zap,
                          sub: "Based on source-code patterns",
                          trend: "Static analysis",
                          positive: true,
                        },
                        {
                          label: "High priority",
                          value: (view === "Security"
                            ? securityFindings
                            : performanceFindings
                          ).filter((f) =>
                            ["critical", "high"].includes(f.severity),
                          ).length,
                          icon: TriangleAlert,
                          sub: "Review these findings first",
                          trend: "Needs review",
                          positive: false,
                        },
                        {
                          label: "Source files",
                          value: fmt(
                            repositories.reduce(
                              (n, r) => n + r.filesScanned,
                              0,
                            ),
                          ),
                          icon: FileCode2,
                          sub: `${fmt(repositories.reduce((n, r) => n + r.linesOfCode, 0))} lines of code`,
                          trend: "Analyzed",
                          positive: true,
                        },
                        {
                          label: "Repositories",
                          value: repositories.length,
                          icon: Box,
                          sub: "In the current selection",
                          trend:
                            mode === "demo"
                              ? "Sample workspace"
                              : "Your workspace",
                          positive: true,
                        },
                      ]
                  ).map(
                    ({
                      label,
                      value,
                      suffix,
                      icon: Icon,
                      sub,
                      trend,
                      positive,
                    }) => (
                      <section className="stat-card" key={label}>
                        <div className="stat-label">
                          {label}
                          <Icon size={17} />
                        </div>
                        <div className="stat-value">
                          {value}
                          <span>{suffix}</span>
                          <span
                            className={`stat-trend ${positive ? "positive" : ""}`}
                          >
                            {label === "Code health" ||
                            label === "Security score" ? (
                              <ArrowUpRight size={11} />
                            ) : label === "Active issues" ? (
                              <ArrowDownLeft size={11} />
                            ) : null}
                            {trend}
                          </span>
                        </div>
                        <p>{sub}</p>
                      </section>
                    ),
                  )}
                </div>
              )}

              {view === "Overview" && (
                <>
                  <div className="overview-charts">
                    <section className="panel health-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            Code health over time{" "}
                            <CircleHelp size={13}>
                              <title>
                                Average static health score across selected
                                repositories
                              </title>
                            </CircleHelp>
                          </h2>
                          <p>
                            A healthier codebase, one improvement at a time.
                          </p>
                        </div>
                        <Badge className="green">
                          <span className="tiny-dot" />{" "}
                          {!hasSource
                            ? "Awaiting data"
                            : health >= 80
                              ? "Healthy"
                              : health >= 50
                                ? "Needs attention"
                                : "At risk"}
                        </Badge>
                      </div>
                      <HealthChart repositories={repositories} days={days} />
                    </section>
                    <section className="panel issue-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Issue breakdown</h2>
                          <p>Know where to focus next.</p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Open issue breakdown"
                          onClick={() => navigate("Code reviews")}
                        >
                          <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <div className="issue-body">
                        <div className="donut-wrap">
                          <svg
                            viewBox="0 0 150 150"
                            aria-label={`${allFindings.length} total issues`}
                          >
                            <circle
                              cx="75"
                              cy="75"
                              r="58"
                              fill="none"
                              stroke="#292f29"
                              strokeWidth="14"
                            />
                            {severityOrder.map((s, i) => {
                              const count = allFindings.filter(
                                (f) => f.severity === s,
                              ).length;
                              const total = Math.max(1, allFindings.length);
                              const prev = severityOrder
                                .slice(0, i)
                                .reduce(
                                  (n, severity) =>
                                    n +
                                    allFindings.filter(
                                      (f) => f.severity === severity,
                                    ).length,
                                  0,
                                );
                              return (
                                <circle
                                  key={s}
                                  cx="75"
                                  cy="75"
                                  r="58"
                                  fill="none"
                                  stroke={severityColor[s]}
                                  strokeWidth="14"
                                  strokeDasharray={`${Math.max(0, (count / total) * 364.42 - (count ? 4 : 0))} 364.42`}
                                  strokeDashoffset={(-prev / total) * 364.42}
                                  transform="rotate(-90 75 75)"
                                />
                              );
                            })}
                          </svg>
                          <div>
                            <strong>{allFindings.length}</strong>
                            <span>Total issues</span>
                          </div>
                        </div>
                        <div className="severity-legend">
                          {severityOrder.map((s) => (
                            <button
                              key={s}
                              onClick={() => {
                                navigate("Code reviews");
                                setSeverity(s);
                              }}
                            >
                              <i style={{ background: severityColor[s] }} />
                              <span>{s[0].toUpperCase() + s.slice(1)}</span>
                              <strong>
                                {
                                  allFindings.filter((f) => f.severity === s)
                                    .length
                                }
                              </strong>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="panel-footer">
                        <ShieldCheck size={13} />
                        <span>
                          {allFindings.filter((f) => f.severity === "critical")
                            .length === 0
                            ? "No critical signals in this analysis"
                            : "Prioritize critical findings for review"}
                        </span>
                      </div>
                    </section>
                  </div>
                  <div className="overview-middle">
                    <section className="panel architecture-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            <Network size={16} /> Architecture at a glance
                          </h2>
                          <p>
                            {current
                              ? `${current.name} · ${current.graph.nodes.length} modules, ${current.graph.edges.length} connections`
                              : "See how your code connects."}
                          </p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("Architecture")}
                        >
                          Explore <ArrowUpRight size={13} />
                        </button>
                      </div>
                      <Graph key={current?.id} repository={current} />
                    </section>
                    <section className="panel insights-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            <span className="sparkle-icon">
                              <Sparkles size={16} />
                            </span>{" "}
                            Intelligence highlights
                          </h2>
                          <p>Small signals. Meaningful improvements.</p>
                        </div>
                        <Badge className="neutral">
                          {mode === "demo" ? "Preview" : "Static analysis"}
                        </Badge>
                      </div>
                      <div className="insights-list">
                        {allFindings.slice(0, 3).map((f) => (
                          <button
                            className="insight"
                            key={f.id}
                            onClick={() => setDetail(f)}
                          >
                            <span className={`insight-icon ${f.category}`}>
                              {f.category === "performance" ? (
                                <Zap size={15} />
                              ) : f.category === "security" ? (
                                <Shield size={15} />
                              ) : (
                                <Code2 size={15} />
                              )}
                            </span>
                            <span>
                              <strong>{f.title}</strong>
                              <small>
                                {f.repository.name}
                                <span>·</span>
                                <em>{f.category}</em>
                              </small>
                            </span>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                        {!allFindings.length && (
                          <div className="empty compact">
                            <CheckCheck size={24} />
                            <p>
                              {repositories.length
                                ? "No static findings in this snapshot."
                                : "Your first analysis brings the insights."}
                            </p>
                          </div>
                        )}
                      </div>
                      <button
                        className="insights-footer"
                        onClick={() => navigate("Code reviews")}
                      >
                        View all insights <ArrowRight size={13} />
                      </button>
                    </section>
                  </div>
                  <section className="panel repositories-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          Your repositories{" "}
                          <span className="count-label">
                            {repositories.length}
                          </span>
                        </h2>
                        <p>The building blocks of your next big thing.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("Repositories")}
                      >
                        View all repositories <ArrowRight size={13} />
                      </button>
                    </div>
                    {renderRepositoryTable({ compact: true })}
                  </section>
                </>
              )}

              {view === "Repositories" && (
                <>
                  <div className="section-toolbar">
                    <span>
                      <GitFork size={16} />
                      {allRepositories.length} repositories in this workspace
                    </span>
                    <button
                      className="button secondary"
                      onClick={() => setConnectOpen(true)}
                    >
                      <Plus size={14} />
                      Connect repository
                    </button>
                  </div>
                  <section className="panel">
                    {renderRepositoryTable({})}
                  </section>
                  <div className="info-note">
                    <ShieldCheck size={16} />
                    <p>
                      Read-only analysis. NEXORA never runs imported code or
                      changes your repository.
                    </p>
                  </div>
                </>
              )}
              {view === "Architecture" && (
                <>
                  <div className="section-toolbar">
                    <span>
                      <Network size={16} />
                      {current
                        ? `${current.name} · ${current.graph.nodes.length} modules · ${current.graph.edges.length} connections`
                        : "No repository selected"}
                    </span>
                    <Badge className="green">Interactive dependency map</Badge>
                  </div>
                  <section className="panel">
                    <Graph key={current?.id} repository={current} expanded />
                  </section>
                  <div className="architecture-meta">
                    <section className="panel">
                      <h3>How to read this map</h3>
                      <p>
                        Click a module to inspect its source file count and
                        connections. Lines represent relative import
                        relationships between modules. Use the zoom controls to
                        explore.
                      </p>
                    </section>
                    <section className="panel">
                      <h3>What this analysis covers</h3>
                      <p>
                        {mode === "demo"
                          ? "This sample map illustrates a service architecture. Analyze your own code to see actual import relationships."
                          : "Modules are grouped by the first two directory segments. Up to 24 modules are shown. Runtime calls, external services, and dynamic imports may not be represented."}
                      </p>
                    </section>
                  </div>
                </>
              )}
              {(view === "Code reviews" ||
                view === "Security" ||
                view === "Performance") && (
                <>
                  {view === "Code reviews" && (
                    <div className="review-banner">
                      <span className="review-banner-icon">
                        <Sparkles size={23} />
                      </span>
                      <div>
                        <h3>A second perspective on your code</h3>
                        <p>
                          Generate a prioritized engineering review. Add AI for
                          a second perspective.
                        </p>
                      </div>
                      <button
                        className="button secondary"
                        disabled={
                          !current || current.source === "demo" || reviewing
                        }
                        onClick={() => void generateReview()}
                      >
                        <Sparkles size={14} />
                        Generate review
                      </button>
                      <button
                        className="button secondary"
                        disabled={
                          !current ||
                          current.source === "demo" ||
                          reviewing ||
                          !workspace?.aiConfigured
                        }
                        title={
                          workspace?.aiConfigured
                            ? "Review findings with your AI model"
                            : "Configure NEXORA_AI_API_KEY in server settings to enable AI"
                        }
                        onClick={() => void generateReview("ai")}
                      >
                        <Sparkles size={14} />
                        AI review
                      </button>
                    </div>
                  )}
                  {view === "Security" && (
                    <div className="info-note">
                      <Shield size={16} />
                      <p>
                        Code signals are heuristic. Dependency findings match
                        locked versions against published npm advisories;
                        exploitability still needs review.
                      </p>
                    </div>
                  )}
                  {view === "Performance" && (
                    <div className="info-note">
                      <Activity size={16} />
                      <p>
                        Performance insights identify static code patterns.
                        Runtime profiling, latency measurements, and load
                        testing are not included.
                      </p>
                    </div>
                  )}
                  {view === "Performance" && mode === "live" && (
                    <section className="coverage-panel panel">
                      <h3>Source complexity analysis</h3>
                      {repositories.map((repository) => (
                        <div key={repository.id}>
                          <span>{repository.name}</span>
                          <Badge className="neutral">
                            {repository.performance
                              ? `${repository.performance.totalFunctions} functions · ${repository.performance.parsedFiles} parsed files`
                              : "Analyze again for source metrics"}
                          </Badge>
                          {repository.performance && (
                            <>
                              <p>
                                Maximum branching complexity:{" "}
                                {repository.performance.maxComplexity} ·
                                Functions above 15 branches:{" "}
                                {repository.performance.highComplexityFunctions}
                              </p>
                              <div className="complexity-list">
                                {repository.performance.functions
                                  .slice(0, 5)
                                  .map((fn) => (
                                    <button
                                      key={`${fn.file}:${fn.line}`}
                                      onClick={() =>
                                        setDetail({
                                          id: `metric-${fn.file}-${fn.line}`,
                                          title: `Complexity of ${fn.name}`,
                                          category: "performance",
                                          severity:
                                            fn.complexity > 15
                                              ? "medium"
                                              : "low",
                                          file: fn.file,
                                          line: fn.line,
                                          description: `This function has ${fn.complexity} estimated independent control-flow paths over ${fn.lines} lines. This is a structural metric, not a runtime measurement.`,
                                          suggestion:
                                            "Review branches and loop bounds. Benchmark realistic inputs before changing performance-sensitive code.",
                                          repository,
                                        })
                                      }
                                    >
                                      <code>
                                        {fn.file}:{fn.line}
                                      </code>
                                      <span>{fn.complexity} paths</span>
                                      <ChevronRight size={12} />
                                    </button>
                                  ))}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </section>
                  )}
                  {view === "Security" && mode === "live" && (
                    <section className="coverage-panel panel">
                      <h3>Dependency advisory coverage</h3>
                      {repositories.map((repository) => (
                        <div key={repository.id}>
                          <span>{repository.name}</span>
                          <Badge
                            className={
                              repository.dependencyAudit?.status === "complete"
                                ? "green"
                                : "neutral"
                            }
                          >
                            {repository.dependencyAudit?.status === "complete"
                              ? `${repository.dependencyAudit.packagesScanned} packages checked`
                              : repository.dependencyAudit?.status ||
                                "Not scanned"}
                          </Badge>
                          <p>
                            {repository.dependencyAudit?.reason ||
                              (repository.dependencyAudit
                                ? `${repository.dependencyAudit.findingsCount} advisory matches in this snapshot.`
                                : "Run analysis again to include dependency advisory checks.")}
                          </p>
                        </div>
                      ))}
                    </section>
                  )}
                  {renderFindingsTable()}
                </>
              )}
              {view === "Settings" && (
                <div className="settings-grid">
                  <section className="panel settings-card">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          <Box size={16} /> Workspace
                        </h2>
                        <p>Everything you need to get oriented.</p>
                      </div>
                    </div>
                    <dl>
                      <div>
                        <dt>Name</dt>
                        <dd>Engineering workspace</dd>
                      </div>
                      <div>
                        <dt>Analysis engine</dt>
                        <dd>
                          <span className="status-dot" />
                          Static analyzer v1.0
                        </dd>
                      </div>
                      <div>
                        <dt>Your repositories</dt>
                        <dd>{workspace?.repositories.length || 0} connected</dd>
                      </div>
                      <div>
                        <dt>Scan limits</dt>
                        <dd>2,000 files · 256 KB per file</dd>
                      </div>
                    </dl>
                    <button
                      className="button secondary"
                      onClick={() => setConnectOpen(true)}
                    >
                      <GitFork size={15} />
                      Connect GitHub repository
                    </button>
                  </section>
                  <section className="panel settings-card">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          <Sparkles size={16} /> AI integration
                        </h2>
                        <p>
                          A focused review of your static-analysis findings.
                        </p>
                      </div>
                      <Badge
                        className={
                          workspace?.aiConfigured ? "green" : "neutral"
                        }
                      >
                        {workspace?.aiConfigured
                          ? "Configured"
                          : "Not configured"}
                      </Badge>
                    </div>
                    <p className="settings-description">
                      Set <code>NEXORA_AI_API_KEY</code> on the server to enable
                      OpenAI reviews. The key stays on the server. Only analysis
                      metadata is sent when you request a review.
                    </p>
                    <dl>
                      <div>
                        <dt>Provider</dt>
                        <dd>OpenAI</dd>
                      </div>
                      <div>
                        <dt>Model</dt>
                        <dd>{workspace?.aiModel || "gpt-4.1-mini"}</dd>
                      </div>
                    </dl>
                    <button
                      className="button secondary"
                      onClick={() => setDocsOpen(true)}
                    >
                      <BookOpen size={15} />
                      Setup guide
                    </button>
                  </section>
                  <section className="panel settings-card">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          <ShieldCheck size={16} /> Data & privacy
                        </h2>
                        <p>Your code deserves a clear boundary.</p>
                      </div>
                    </div>
                    <p className="settings-description">
                      Analysis snapshots are saved to persistent server storage.
                      Temporary GitHub checkouts are removed after scanning.
                      Reports include file paths and findings, not source
                      contents.
                    </p>
                    <p className="settings-description">
                      {workspace?.authRequired
                        ? "This workspace requires sign-in. Sessions expire after 24 hours and are reset when the server restarts."
                        : "Local development has no password configured. Production requires NEXORA_AUTH_PASSWORD."}
                    </p>
                    <button
                      className="button secondary"
                      disabled={!repositories.length}
                      onClick={exportReport}
                    >
                      <Download size={15} />
                      Export analysis data
                    </button>
                    {workspace?.authRequired && (
                      <button
                        className="button secondary logout-button"
                        onClick={() => {
                          void api("/api/session/logout", {
                            method: "POST",
                            body: "{}",
                          })
                            .then(() => {
                              setSession({
                                authenticated: false,
                                authRequired: true,
                              });
                              setWorkspace(null);
                            })
                            .catch((error) => setToast(error.message));
                        }}
                      >
                        Sign out
                      </button>
                    )}
                  </section>
                  <section className="panel settings-card">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          <GitPullRequest size={16} />
                          Automated reviews
                        </h2>
                        <p>
                          Trigger analysis from GitHub pushes and pull requests.
                        </p>
                      </div>
                      <Badge
                        className={
                          workspace?.webhooksConfigured ? "green" : "neutral"
                        }
                      >
                        {workspace?.webhooksConfigured
                          ? "Webhook enabled"
                          : "Not configured"}
                      </Badge>
                    </div>
                    <p className="settings-description">
                      Set <code>NEXORA_GITHUB_WEBHOOK_SECRET</code> on the
                      server. In your GitHub repository, add a JSON webhook to{" "}
                      <code>/api/webhooks/github</code> on this app’s public URL
                      using the same secret. Enable push and pull request
                      events.
                    </p>
                    <p className="settings-description">
                      Signatures are verified before a job is queued. Analysis
                      reviews the event’s commit and saves a review here. No PR
                      comments are posted automatically.
                    </p>
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="footer-mark">✳</span> A little intelligence. A
              lot of possibility.
            </span>
            <span>
              NEXORA<span className="footer-dot">·</span>
              {mode === "demo"
                ? "Demo workspace · sample data"
                : "Your workspace · local analysis"}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Activity size={17} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {connectOpen && (
        <Modal
          title="Connect your code"
          subtitle="A new perspective starts with a repository."
          onClose={() => setConnectOpen(false)}
        >
          <div className="connect-intro">
            <GitFork size={24} />
            <div>
              <strong>Import from GitHub</strong>
              <p>
                Public repositories and repositories your environment can
                access.
              </p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!repositoryInput.trim())
                setFormError("Enter a GitHub repository first.");
              else void analyze(repositoryInput.trim());
            }}
          >
            <label className="input-label" htmlFor="repository">
              Repository URL or owner/name
            </label>
            <div className="input-wrap">
              <GitFork size={17} />
              <input
                id="repository"
                value={repositoryInput}
                onChange={(e) => setRepositoryInput(e.target.value)}
                placeholder="e.g. expressjs/express"
                disabled={running}
                autoFocus
              />
            </div>
            <p className="input-hint">
              HTTPS GitHub URLs are supported. Imported code is never executed.
            </p>
            {formError && (
              <p className="form-error" role="alert">
                <TriangleAlert size={14} />
                {formError}
              </p>
            )}
            {running && (
              <div className="modal-progress">
                <LoaderCircle className="spin" size={16} />
                {job?.message || "Starting analysis…"}
              </div>
            )}
            <button
              className="button primary full-width"
              disabled={running}
              type="submit"
            >
              {running ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Plus size={15} />
              )}
              Import & analyze
            </button>
          </form>
          <div className="or-divider">
            <span>or start right here</span>
          </div>
          <button
            className="local-connect"
            disabled={running}
            onClick={() => void analyze()}
          >
            <span className="repo-icon">
              <Terminal size={19} />
            </span>
            <span>
              <strong>Analyze this workspace</strong>
              <small>
                Scan the local NEXORA project. No credentials needed.
              </small>
            </span>
            <ArrowRight size={16} />
          </button>
          <p className="privacy-note">
            <ShieldCheck size={13} />
            Read-only by design. Your code stays yours.
          </p>
        </Modal>
      )}
      {detail && (
        <Modal
          title={detail.title}
          subtitle={`${detail.repository.owner}/${detail.repository.name}`}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="detail-badges">
            <Badge className={detail.severity}>
              {detail.severity} priority
            </Badge>
            <Badge className="neutral">{detail.category}</Badge>
            {detail.origin === "dependency" && (
              <Badge className="neutral">Dependency advisory</Badge>
            )}
            {detail.repository.source === "demo" && (
              <Badge className="neutral">Sample finding</Badge>
            )}
          </div>
          <div className="file-location">
            <FileCode2 size={16} />
            <code>
              {detail.file}:{detail.line}
            </code>
            {detail.repository.source === "github" && (
              <a
                href={`https://github.com/${(detail.repository.githubRepository || `${detail.repository.owner}/${detail.repository.name}`).split("/").map(encodeURIComponent).join("/")}/blob/${encodeURIComponent(detail.repository.branch)}/${detail.file.split("/").map(encodeURIComponent).join("/")}#L${detail.line}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Open file on GitHub"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
          <h3 className="detail-label">What we found</h3>
          <p className="detail-description">{detail.description}</p>
          {detail.advisoryUrl && (
            <a
              className="text-button"
              href={detail.advisoryUrl}
              target="_blank"
              rel="noreferrer"
            >
              Read the published advisory <ExternalLink size={13} />
            </a>
          )}
          <div className="recommendation">
            <span>
              <Sparkles size={16} />
              Recommended next step
            </span>
            <p>{detail.suggestion}</p>
          </div>
          <div className="info-note">
            <CircleHelp size={15} />
            <p>
              Review this finding in context. Static analysis identifies
              patterns and cannot confirm a bug or its impact.
            </p>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(
                    `${detail.title}\n${detail.file}:${detail.line}\n${detail.description}\n\n${detail.suggestion}`,
                  )
                  .then(() => setToast("Finding copied to clipboard."))
                  .catch(() =>
                    setToast(
                      "Clipboard unavailable. Use the export report instead.",
                    ),
                  );
              }}
            >
              Copy finding
            </button>
            <button className="button primary" onClick={() => setDetail(null)}>
              <Check size={15} />
              Done
            </button>
          </div>
        </Modal>
      )}
      {docsOpen && (
        <Modal
          title="A clearer view of your code"
          subtitle="The NEXORA quick-start guide"
          onClose={() => setDocsOpen(false)}
          wide
        >
          <div className="docs-content">
            <section>
              <span>01</span>
              <div>
                <h3>Connect a repository</h3>
                <p>
                  Use “Run analysis” to import a GitHub repository or scan the
                  local workspace. Existing environment authentication is
                  reused. Private repositories need read access through your
                  environment.
                </p>
              </div>
            </section>
            <section>
              <span>02</span>
              <div>
                <h3>Explore the signals</h3>
                <p>
                  Inspect module relationships in Architecture, filter findings
                  by severity, and open an issue for its file location and
                  recommended next step. Reports export as JSON.
                </p>
              </div>
            </section>
            <section>
              <span>03</span>
              <div>
                <h3>Add an AI perspective</h3>
                <p>
                  Set <code>NEXORA_AI_API_KEY</code> securely on the server,
                  optionally choose <code>NEXORA_AI_MODEL</code>, and restart.
                  Allow HTTPS access to <code>api.openai.com</code>. Then
                  request a review from Code reviews after analyzing a real
                  repository.
                </p>
              </div>
            </section>
            <section>
              <span>04</span>
              <div>
                <h3>Understand the boundaries</h3>
                <p>
                  The analyzer checks source-code patterns and npm lockfiles
                  against published advisories. It does not measure runtime
                  behavior. The graph reflects relative imports, not a verified
                  deployment architecture. AI output needs human review.
                </p>
              </div>
            </section>
            <div className="info-note">
              <Terminal size={16} />
              <p>
                Local development: <code>npm ci</code>, then{" "}
                <code>npm run dev</code>. Production build:{" "}
                <code>npm run build</code>, then <code>npm start</code>.
              </p>
            </div>
          </div>
        </Modal>
      )}
      {reviewOpen && (
        <Modal
          title={
            reviewMode === "ai" ? "AI engineering review" : "Engineering review"
          }
          subtitle={
            reviewMode === "static"
              ? "Prioritized analysis · generated from deterministic rules"
              : workspace?.aiConfigured
                ? `${workspace.aiModel} · based on analysis metadata`
                : "AI integration is not configured"
          }
          onClose={() => setReviewOpen(false)}
          wide
        >
          {reviewing ? (
            <div className="loading">
              <LoaderCircle className="spin" size={24} />
              <p>Looking for a useful second perspective…</p>
            </div>
          ) : (
            <div className="review-output">{review}</div>
          )}
          <div className="info-note">
            <CircleHelp size={15} />
            <p>
              {reviewMode === "ai"
                ? "AI output is advisory. Source code is not sent, and findings are not independently verified by the model."
                : "This review is generated from scan rules and dependency advisories. It is not AI output or a runtime test."}
            </p>
          </div>
        </Modal>
      )}
      {removeRepo && (
        <Modal
          title="Remove repository analysis?"
          subtitle={`${removeRepo.owner}/${removeRepo.name}`}
          onClose={() => setRemoveRepo(null)}
        >
          <p className="detail-description">
            This removes the saved analysis snapshot from your workspace. Your
            source code and GitHub repository will remain unchanged.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setRemoveRepo(null)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              onClick={() => void deleteRepository()}
            >
              Remove analysis
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default App;
