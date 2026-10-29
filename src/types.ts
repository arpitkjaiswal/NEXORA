export type Severity = "critical" | "high" | "medium" | "low";
export type Category = "security" | "performance" | "quality";
export interface Finding {
  id: string;
  title: string;
  category: Category;
  severity: Severity;
  file: string;
  line: number;
  description: string;
  suggestion: string;
  origin?: "dependency";
  advisoryUrl?: string;
}
export interface GraphNode {
  id: string;
  label: string;
  type: string;
  files: number;
}
export interface Repository {
  id: string;
  name: string;
  owner: string;
  source: "demo" | "local" | "github";
  githubRepository?: string;
  dependencyAudit?: {
    status: "complete" | "unsupported" | "unavailable";
    packagesScanned: number;
    findingsCount: number;
    reason?: string;
  };
  performance?: {
    parsedFiles: number;
    totalFunctions: number;
    maxComplexity: number;
    highComplexityFunctions: number;
    functions: {
      name: string;
      file: string;
      line: number;
      complexity: number;
      lines: number;
    }[];
  };
  branch: string;
  analyzedAt: string;
  durationMs: number;
  filesScanned: number;
  linesOfCode: number;
  truncated?: boolean;
  health: number;
  securityScore: number;
  findings: Finding[];
  languages: { name: string; color: string; files: number; lines: number }[];
  graph: { nodes: GraphNode[]; edges: { source: string; target: string }[] };
  history: { date: string; score: number }[];
}
export interface Job {
  id: string;
  status: "running" | "complete" | "failed";
  progress: number;
  message: string;
  result?: Repository;
}
export interface Workspace {
  repositories: Repository[];
  demoRepositories: Repository[];
  aiConfigured: boolean;
  aiModel: string;
  activeJob: Job | null;
  authRequired?: boolean;
  webhooksConfigured?: boolean;
  analysisHistory?: (Job & {
    repository?: string;
    repositoryId?: string;
    createdAt: string;
    completedAt?: string;
  })[];
}
export interface Session {
  authenticated: boolean;
  authRequired: boolean;
}
export type View =
  | "Overview"
  | "Repositories"
  | "Architecture"
  | "Code reviews"
  | "Security"
  | "Performance"
  | "Settings";
