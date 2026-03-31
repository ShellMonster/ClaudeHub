/** 仓库分类键（9 个类别） */
export type CategoryKey =
  | 'analysis'
  | 'tutorial'
  | 'book_or_longform'
  | 'awesome_list'
  | 'reimplementation'
  | 'tooling'
  | 'security'
  | 'discussion_archive'
  | 'other';

/** 分类键 → 人类可读标签映射 */
export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  analysis: '源码分析',
  tutorial: '教程指南',
  book_or_longform: '书籍/长文',
  awesome_list: 'Awesome 列表',
  reimplementation: '重新实现',
  tooling: '工具集成',
  security: '安全研究',
  discussion_archive: '讨论归档',
  other: '其他',
};

/** JSON 输出中的单个仓库条目 */
export interface NavItem {
  /** 仓库标识，格式：owner_repo */
  id: string;
  /** 仓库名称 */
  name: string;
  /** 仓库所有者 */
  owner: string;
  /** 仓库 URL */
  url: string;
  /** 仓库描述 */
  description: string;
  /** 一句话摘要 */
  summary: string;
  /** 2-5 个标签 */
  tags: string[];
  /** Star 数 */
  stars: number;
  /** Fork 数 */
  forks: number;
  /** 最后更新时间（ISO8601） */
  updated_at: string;
  /** 内容类型 */
  content_type: string;
  /** 评分 1-5 */
  score: number;
  /** 是否为新增仓库 */
  new: boolean;
  /** 是否存在镜像风险 */
  mirror_risk: boolean;
  /** 原创分析可能性 */
  original_analysis_likelihood: 'high' | 'medium' | 'low';
  /** 仓库是否已不可访问（可选） */
  unavailable?: boolean;
}

/** JSON 中的分类区块 */
export interface CategorySection {
  /** 分类键 */
  key: CategoryKey;
  /** 分类标签 */
  label: string;
  /** 该分类下的仓库列表 */
  items: NavItem[];
}

/** 顶层 JSON 数据结构 */
export interface NavigationData {
  /** 生成时间（ISO8601） */
  generated_at: string;
  /** 数据来源 */
  source: 'github';
  /** Schema 版本号 */
  schema_version: string;
  /** 分类列表 */
  categories: CategorySection[];
}

/** GitHub REST API 原始仓库响应 */
export interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  language: string | null;
  topics: string[];
  archived: boolean;
  fork: boolean;
}

/** 搜索查询配置 */
export interface SearchConfig {
  /** 搜索关键词 */
  query: string;
  /** 排序方式 */
  sort: 'stars' | 'updated';
  /** 每页返回数量 */
  perPage: number;
}

/** AI 分析器输出结果 */
export interface AIAnalysisResult {
  /** 分类 */
  category: CategoryKey;
  /** 标签列表 */
  tags: string[];
  /** 一句话摘要 */
  summary: string;
  /** 评分 1-5 */
  score: number;
  /** 是否存在镜像风险 */
  mirror_risk: boolean;
  /** 原创分析可能性 */
  original_analysis_likelihood: 'high' | 'medium' | 'low';
}

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as CategoryKey[];

/** 检查值是否为合法的 CategoryKey */
export function isCategoryKey(value: string): value is CategoryKey {
  return CATEGORY_KEYS.includes(value as CategoryKey);
}

/** 检查值是否为合法的 original_analysis_likelihood */
export function isLikelihood(value: string): value is 'high' | 'medium' | 'low' {
  return ['high', 'medium', 'low'].includes(value);
}

/** 检查对象是否为合法的 NavItem */
export function isNavItem(obj: unknown): obj is NavItem {
  if (typeof obj !== 'object' || obj === null) return false;
  const item = obj as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.owner === 'string' &&
    typeof item.url === 'string' &&
    typeof item.description === 'string' &&
    typeof item.summary === 'string' &&
    Array.isArray(item.tags) &&
    typeof item.stars === 'number' &&
    typeof item.forks === 'number' &&
    typeof item.updated_at === 'string' &&
    typeof item.content_type === 'string' &&
    typeof item.score === 'number' &&
    typeof item.new === 'boolean' &&
    typeof item.mirror_risk === 'boolean' &&
    isLikelihood(item.original_analysis_likelihood as string)
  );
}

/** 检查对象是否为合法的 GitHubRepo */
export function isGitHubRepo(obj: unknown): obj is GitHubRepo {
  if (typeof obj !== 'object' || obj === null) return false;
  const repo = obj as Record<string, unknown>;
  return (
    typeof repo.id === 'number' &&
    typeof repo.full_name === 'string' &&
    typeof repo.name === 'string' &&
    typeof repo.owner === 'object' &&
    repo.owner !== null &&
    typeof (repo.owner as Record<string, unknown>).login === 'string' &&
    typeof repo.html_url === 'string' &&
    (repo.description === null || typeof repo.description === 'string') &&
    typeof repo.stargazers_count === 'number' &&
    typeof repo.forks_count === 'number' &&
    typeof repo.updated_at === 'string' &&
    (repo.language === null || typeof repo.language === 'string') &&
    Array.isArray(repo.topics) &&
    typeof repo.archived === 'boolean' &&
    typeof repo.fork === 'boolean'
  );
}
