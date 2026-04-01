/**
 * 仓库去重模块
 *
 * 功能：
 * 1. 基于 repo.id 去重（id 永远不变，full_name 可能变）
 * 2. URL 规范化（仅用于展示）
 * 3. Fork 过滤（低价值 fork 排除）
 * 4. 泄露源排除（blocklist）
 * 5. 内容相似度（相同描述保留高星）
 */

import type { GitHubRepo } from './types.js';

// ─── 泄露源关键词黑名单 ────────────────────────────────────────
const LEAK_KEYWORDS = [
  'sourcemap',
  'source-code-leak',
  'leaked-claude-code',
  'source-map-leak',
  'deobfuscat',
  'claude-code-source-code',
] as const;

// ─── 泄露源仓库黑名单（精确匹配 owner/repo） ──────────────────
const REPO_BLOCKLIST = new Set([
  'sanbuphy/claude-code-source-code',
  'Zen996007/claude-code-source-code',
]);

// ─── 分析类关键词（含这些关键词的仓库不会被排除） ──────────────
const ANALYSIS_KEYWORDS = [
  'analysis',
  'analyzed',
  'research',
  'study',
  'investigation',
  'report',
  'review',
  'breakdown',
  'deep-dive',
  '解读',
  '分析',
] as const;

// ─── 内部工具函数 ──────────────────────────────────────────────

/**
 * URL 规范化：去除尾部斜杠、小写 owner/repo、去除 .git 后缀、http→https
 * 仅用于展示比较，不修改原始数据
 */
export function normalizeUrl(url: string): string {
  let normalized = url.trim();

  // http → https
  if (normalized.startsWith('http://')) {
    normalized = 'https://' + normalized.slice(7);
  }

  // 去除尾部斜杠
  normalized = normalized.replace(/\/+$/, '');

  // 去除 .git 后缀
  normalized = normalized.replace(/\.git$/, '');

  // 小写 owner/repo 部分（https://github.com/Owner/Repo → https://github.com/owner/repo）
  try {
    const parsed = new URL(normalized);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      pathParts[0] = pathParts[0].toLowerCase();
      pathParts[1] = pathParts[1].toLowerCase();
      parsed.pathname = '/' + pathParts.join('/');
      normalized = parsed.toString();
    }
  } catch {
    // URL 解析失败，保持原样
  }

  // 再次去除尾部斜杠（URL 构造可能添加）
  return normalized.replace(/\/+$/, '');
}

/**
 * 判断仓库是否为泄露源（纯镜像）
 * 检查 repo.name 和 repo.description 是否包含泄露关键词
 * 如果同时包含分析类关键词，则保留（分析仓库不排除）
 */
function isLeakMirror(repo: GitHubRepo): boolean {
  // 精确匹配黑名单仓库
  if (REPO_BLOCKLIST.has(repo.full_name.toLowerCase())) {
    return true;
  }

  const textToCheck = [
    repo.name.toLowerCase(),
    (repo.description ?? '').toLowerCase(),
  ].join(' ');

  // 包含分析类关键词 → 保留
  for (const keyword of ANALYSIS_KEYWORDS) {
    if (textToCheck.includes(keyword.toLowerCase())) {
      return false;
    }
  }

  // 检查泄露关键词
  for (const keyword of LEAK_KEYWORDS) {
    if (textToCheck.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * 判断 fork 是否为低价值 fork
 * 排除条件：fork=true 且 stars < 父仓库的 10%
 * 保留条件：stars >= 父仓库 10% 或有独特描述
 */
function isLowValueFork(
  repo: GitHubRepo,
  parentStars: number | undefined,
): boolean {
  if (!repo.fork) return false;

  // 没有父仓库信息，保留
  if (parentStars === undefined) return false;

  // stars >= 父仓库 10% → 保留
  if (repo.stargazers_count >= parentStars * 0.1) return false;

  // 有独特描述（非空且长度 > 10）→ 保留
  if (repo.description && repo.description.trim().length > 10) return false;

  return true;
}

/**
 * 提取描述的标准化形式（用于相似度比较）
 */
function normalizeDescription(desc: string | null): string {
  if (!desc) return '';
  return desc.trim().toLowerCase();
}

// ─── Claude Code 相关性过滤 ──────────────────────────────────────

/** Claude Code 生态关键词（中等信号，需要匹配多个） */
const CLAUDE_CODE_MEDIUM_SIGNALS = [
  'cli',
  'terminal',
  'agent',
  'coding assistant',
  'sourcemap',
  'source code',
  'npm',
  'anthropic',
  'skill',
  'hook',
  'mcp',
  'plugin',
  'slash command',
] as const;

/**
 * 判断仓库是否与 Claude Code（Anthropic CLI 工具）相关
 *
 * 相关性规则：
 * - 强信号（任一匹配即相关）：名称/描述含 "claude code"、"claude-code"、"claudecode"、"claude_code"
 * - 强信号：topics 含 "claude-code" 或 "claude-code-cli"
 * - 中等信号（需 2+ 匹配）：描述含 "claude" + 生态关键词
 * - 特殊信号：含 "openclaw" 或含 "codex" + "claude"
 */
export function isRelevantToClaudeCode(repo: GitHubRepo): boolean {
  const name = repo.name.toLowerCase();
  const desc = (repo.description ?? '').toLowerCase();
  const text = `${name} ${desc}`;
  const topics = repo.topics ?? [];

  // ── 强信号：名称/描述直接包含 Claude Code 标识 ──
  if (
    text.includes('claude code') ||
    text.includes('claude-code') ||
    text.includes('claudecode') ||
    text.includes('claude_code')
  ) {
    return true;
  }

  // ── 强信号：topics 包含 Claude Code 相关标签 ──
  if (topics.includes('claude-code') || topics.includes('claude-code-cli')) {
    return true;
  }

  // ── 特殊信号：OpenClaw（开源 Claude Code 替代方案）──
  if (text.includes('openclaw')) {
    return true;
  }

  // ── 特殊信号：codex + claude 组合 ──
  if (text.includes('codex') && text.includes('claude')) {
    return true;
  }

  // ── 中等信号：描述含 claude + 生态关键词（需 2+ 匹配）──
  if (desc.includes('claude')) {
    let matchCount = 0;
    for (const signal of CLAUDE_CODE_MEDIUM_SIGNALS) {
      if (desc.includes(signal)) {
        matchCount++;
      }
    }
    return matchCount >= 2;
  }

  return false;
}

// ─── 主函数 ────────────────────────────────────────────────────

/**
 * 仓库去重与过滤
 *
 * 处理流程：
 * 0. 过滤不相关仓库（Claude Code 相关性）
 * 1. 排除泄露源（纯镜像）
 * 2. 基于 ID 去重 + 相同描述保留高星
 * 3. 相同描述保留高星（跨不同 ID 的仓库）
 * 4. 过滤低价值 fork
 *
 * @param repos - 原始仓库列表
 * @param parentStarsMap - 可选的父仓库星数映射（repo.id → parentStars）
 * @returns 去重后的仓库列表
 */
export function deduplicate(
  repos: GitHubRepo[],
  parentStarsMap?: Map<number, number>,
): GitHubRepo[] {
  // ── 第 0 步：过滤不相关仓库 ────────────────────────────
  const relevant = repos.filter((repo) => isRelevantToClaudeCode(repo));
  console.info(`[dedup] 相关性过滤: ${relevant.length}/${repos.length} 个仓库与 Claude Code 相关`);

  // ── 第 0.5 步：过滤低星仓库（减少噪音） ──────────────────────
  const MIN_STARS = 3;
  const starred = relevant.filter((repo) => repo.stargazers_count >= MIN_STARS);
  console.info(`[dedup] 星数过滤(>=${MIN_STARS}): ${starred.length}/${relevant.length} 个仓库保留`);

  // ── 第 1 步：排除泄露源 ────────────────────────────────────
  const nonLeak = starred.filter((repo) => !isLeakMirror(repo));

  // ── 第 2 步：基于 ID 去重 + 相同描述保留高星 ────────────────
  const seenIds = new Set<number>();
  // 用 Map 收集，key 为 id，用于后续相同描述合并
  const uniqueMap = new Map<number, GitHubRepo>();

  for (const repo of nonLeak) {
    if (seenIds.has(repo.id)) {
      // 相同 ID，比较星数保留更高的
      const existing = uniqueMap.get(repo.id)!;
      if (repo.stargazers_count > existing.stargazers_count) {
        uniqueMap.set(repo.id, repo);
      }
      continue;
    }

    seenIds.add(repo.id);
    uniqueMap.set(repo.id, repo);
  }

  // ── 第 3 步：相同描述保留高星（跨不同 ID 的仓库） ────────────
  const descMap = new Map<string, GitHubRepo>();

  for (const repo of uniqueMap.values()) {
    const descKey = normalizeDescription(repo.description);

    // 空描述跳过相似度检查
    if (!descKey) {
      descMap.set(`__empty_${repo.id}`, repo);
      continue;
    }

    const existing = descMap.get(descKey);
    if (existing) {
      // 相同描述，保留高星
      if (repo.stargazers_count > existing.stargazers_count) {
        descMap.set(descKey, repo);
      }
    } else {
      descMap.set(descKey, repo);
    }
  }

  // ── 第 4 步：过滤低价值 fork ────────────────────────────────────────
  const result: GitHubRepo[] = [];

  for (const repo of descMap.values()) {
    const parentStars = parentStarsMap?.get(repo.id);
    if (isLowValueFork(repo, parentStars)) {
      continue;
    }
    result.push(repo);
  }

  return result;
}
