/**
 * AI 分析器 — 使用 OpenAI 兼容 API 分析 GitHub 仓库
 *
 * 功能：
 * - 调用第三方 OpenAI 兼容 API 进行仓库分类
 * - 支持重试（指数退避）和速率限制
 * - API 不可用时自动降级到基于规则的关键词匹配
 */

import type { GitHubRepo, AIAnalysisResult, CategoryKey } from './types.js';
import { isCategoryKey, isLikelihood } from './types.js';

// ─── 常量 ────────────────────────────────────────────────────────────

/** 最大重试次数 */
const MAX_RETRIES = 3;

/** 基础重试延迟（毫秒） */
const BASE_RETRY_DELAY = 1000;

/** API 调用间隔（毫秒），用于速率限制 */
const API_CALL_DELAY = 500;

/** 上一次 API 调用时间戳 */
let lastCallTime = 0;

// ─── 环境变量读取 ─────────────────────────────────────────────────────

/** 获取 API 配置，缺少任一变量返回 null */
function getApiConfig(): { baseUrl: string; apiKey: string; model: string } | null {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl, apiKey, model };
}

// ─── 工具函数 ─────────────────────────────────────────────────────────

/** 休眠指定毫秒数 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 确保两次 API 调用之间至少间隔 API_CALL_DELAY 毫秒 */
async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < API_CALL_DELAY) {
    await sleep(API_CALL_DELAY - elapsed);
  }
  lastCallTime = Date.now();
}

// ─── Prompt 构建 ──────────────────────────────────────────────────────

/**
 * 构建分析仓库的系统提示词和用户消息
 */
function buildPrompt(repo: GitHubRepo): { system: string; user: string } {
  const system = `You are a GitHub repository classifier. You MUST respond with ONLY a valid JSON object, no markdown, no explanation, no code fences. The JSON must have exactly these fields:
- "category": one of [source_analysis, reverse_engineering, tutorial, skill_plugin, tooling, security, awesome_list, book_or_longform, reimplementation, discussion_archive, other]
- "tags": array of 2-5 relevant tags (strings)
- "summary": one-line description (max 100 chars, in English)
- "score": integer from 1 to 5
- "mirror_risk": boolean (true if appears to be source code leak or unauthorized mirror)
- "original_analysis_likelihood": one of "high", "medium", "low"

Classification rules:
- "source_analysis": repos that analyze Claude Code's architecture, source code, internals, prompts, or system design
- "reverse_engineering": repos that reverse engineer, decompile, or decode Claude Code's obfuscated/minified source
- "skill_plugin": repos that provide Claude Code skills (.md), plugins, MCP servers, or slash commands
- "tooling": repos that provide CLI tools, extensions, wrappers, dashboards, or integrations for Claude Code
- "tutorial": repos that teach how to use Claude Code (courses, guides, workshops, examples)
- "security": repos focused on security auditing, vulnerability research, or pentesting with/for Claude Code`;

  const user = `Analyze this GitHub repository and classify it:

Name: ${repo.name}
Owner: ${repo.owner.login}
Description: ${repo.description ?? '(no description)'}
Stars: ${repo.stargazers_count}
Language: ${repo.language ?? 'unknown'}
Topics: ${repo.topics.join(', ')}

Return ONLY the JSON object.`;

  return { system, user };
}

// ─── AI API 调用 ──────────────────────────────────────────────────────

/**
 * 调用 OpenAI 兼容的 Chat Completions API
 *
 * 支持任何 OpenAI 格式兼容的第三方 API（如 Gemini、GLM 等）
 * 环境变量：ANTHROPIC_BASE_URL（API 地址）、ANTHROPIC_API_KEY、ANTHROPIC_MODEL
 *
 * @returns AI 返回的原始文本
 * @throws 网络错误或超过重试次数
 */
async function callApi(
  config: { baseUrl: string; apiKey: string; model: string },
  repo: GitHubRepo
): Promise<string> {
  const { system, user } = buildPrompt(repo);
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const body = {
    model: config.model,
    max_tokens: 512,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await enforceRateLimit();

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      // 速率限制 — 等待后重试
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
        const delay = retryAfter * 1000;
        console.warn(`[ai-analyzer] 速率限制 429，等待 ${retryAfter}s 后重试...`);
        await sleep(delay);
        lastError = new Error(`API 速率限制: 429`);
        continue;
      }

      // 服务器错误 — 指数退避重试
      if (response.status >= 500) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
        console.warn(
          `[ai-analyzer] 服务器错误 ${response.status}，第 ${attempt + 1} 次重试，等待 ${delay}ms...`
        );
        await sleep(delay);
        lastError = new Error(`API 服务器错误: ${response.status}`);
        continue;
      }

      // 其他非成功状态码 — 不重试
      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      // 提取文本内容（OpenAI 格式）
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('API 返回内容格式异常：缺少 choices');
      }

      return content;
    } catch (error) {
      // 网络错误 — 重试
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
        console.warn(
          `[ai-analyzer] 网络错误，第 ${attempt + 1} 次重试，等待 ${delay}ms...`
        );
        await sleep(delay);
        lastError = error;
        continue;
      }
      // 非网络错误直接抛出
      throw error;
    }
  }

  throw lastError ?? new Error('API 调用失败：超过最大重试次数');
}

// ─── JSON 解析 ────────────────────────────────────────────────────────

/**
 * 从 AI 返回的文本中提取并验证 JSON
 *
 * AI 可能返回带 markdown 代码围栏的 JSON，需要清理
 */
function parseAIResponse(text: string): AIAnalysisResult | null {
  try {
    // 去除可能的 markdown 代码围栏
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(cleaned);

    // 验证所有字段
    if (!isCategoryKey(parsed.category)) return null;
    if (!Array.isArray(parsed.tags) || parsed.tags.length < 1) return null;
    if (typeof parsed.summary !== 'string') return null;
    if (typeof parsed.score !== 'number' || parsed.score < 1 || parsed.score > 5) return null;
    if (typeof parsed.mirror_risk !== 'boolean') return null;
    if (!isLikelihood(parsed.original_analysis_likelihood)) return null;

    return {
      category: parsed.category,
      tags: parsed.tags.slice(0, 5).map(String),
      summary: parsed.summary.slice(0, 100),
      score: Math.round(parsed.score),
      mirror_risk: parsed.mirror_risk,
      original_analysis_likelihood: parsed.original_analysis_likelihood,
    };
  } catch {
    return null;
  }
}

// ─── 基于规则的降级分析 ───────────────────────────────────────────────

/** 各分类的关键词映射 */
const CATEGORY_KEYWORDS: Record<CategoryKey, string[]> = {
  source_analysis: ['analysis', 'analyze', 'source code', 'deep dive', 'walkthrough', '解读', '剖析', 'architecture', 'internals', 'source-analysis', '源码分析', 'code-analysis'],
  reverse_engineering: ['reverse engineer', 'decompile', 'deobfuscat', 'reverse-engineering', '逆向', '反编译', 'decoded', 'unpacked', 'sourcemap'],
  tutorial: ['tutorial', 'guide', 'course', 'learn', 'getting started', '教程', '指南', '入门', 'handbook', 'workshop', 'mastery'],
  skill_plugin: ['skill', 'plugin', 'mcp server', 'mcp-server', 'slash command', 'agent skill', ' Skills', 'SKILL.md', 'agent-skill'],
  tooling: ['tool', 'cli', 'extension', 'wrapper', 'sdk', 'dashboard', '工具', 'monitor', 'analyzer', 'vscode', 'integration'],
  security: ['security', 'vulnerability', 'exploit', 'pentest', 'ctf', '安全', '漏洞', 'red team', 'audit', 'scan'],
  awesome_list: ['awesome', 'curated', 'collection', 'list-of', 'best-of', '精选'],
  book_or_longform: ['book', 'ebook', 'longform', 'series', '书籍', '手册', 'cookbook'],
  reimplementation: ['reimpl', 'clone', 'from scratch', 'build your own', '重新实现', '自制', 'write your own', 'nano-'],
  discussion_archive: ['discussion', 'archive', 'faq', 'issues', 'forum', '讨论', '归档', 'weekly'],
  other: [],
};

/**
 * 基于关键词的规则分析（降级方案）
 *
 * 通过仓库名称、描述和 topics 进行关键词匹配
 */
function ruleBasedAnalysis(repo: GitHubRepo): AIAnalysisResult {
  const text = [
    repo.name,
    repo.description ?? '',
    ...repo.topics,
  ]
    .join(' ')
    .toLowerCase();

  // 按匹配关键词数量排序，选择最佳分类
  let bestCategory: CategoryKey = 'other';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [CategoryKey, string[]][]) {
    const matchCount = keywords.filter((kw) => text.includes(kw.toLowerCase())).length;
    if (matchCount > bestScore) {
      bestScore = matchCount;
      bestCategory = category;
    }
  }

  // 生成标签（取 topics 前 3 个，不足则用 language 补充）
  const tags: string[] = [...repo.topics.slice(0, 3)];
  if (tags.length < 2 && repo.language) {
    tags.push(repo.language.toLowerCase());
  }
  if (tags.length === 0) {
    tags.push('uncategorized');
  }

  // 生成摘要
  const summary = repo.description
    ? repo.description.length > 100
      ? repo.description.slice(0, 97) + '...'
      : repo.description
    : `${repo.owner.login}/${repo.name}`;

  // 评分：基于 star 数的简单映射
  const score = repo.stargazers_count >= 10000
    ? 5
    : repo.stargazers_count >= 1000
      ? 4
      : repo.stargazers_count >= 100
        ? 3
        : repo.stargazers_count >= 10
          ? 2
          : 1;

  // 镜像风险：fork 且 star 数远低于原仓库水平
  const mirrorRisk = repo.fork && repo.stargazers_count < 50;

  return {
    category: bestCategory,
    tags,
    summary,
    score,
    mirror_risk: mirrorRisk,
    original_analysis_likelihood: bestScore >= 2 ? 'high' : bestScore === 1 ? 'medium' : 'low',
  };
}

// ─── 主入口 ───────────────────────────────────────────────────────────

/**
 * 使用 AI 分析 GitHub 仓库
 *
 * 优先调用 Anthropic 兼容 API，失败时降级到基于规则的分析。
 *
 * @param repo GitHub 仓库信息
 * @returns AI 分析结果（始终返回有效结果）
 */
export async function analyzeRepo(repo: GitHubRepo): Promise<AIAnalysisResult> {
  const config = getApiConfig();

  // 缺少环境变量 → 直接降级
  if (!config) {
    console.info(`[ai-analyzer] 未配置 API 环境变量，使用规则分析: ${repo.full_name}`);
    return ruleBasedAnalysis(repo);
  }

  try {
    const rawText = await callApi(config, repo);
    const result = parseAIResponse(rawText);

    if (result) {
      console.info(`[ai-analyzer] AI 分析完成: ${repo.full_name} → ${result.category}`);
      return result;
    }

    // JSON 解析失败 → 降级
    console.warn(`[ai-analyzer] AI 返回无效 JSON，降级到规则分析: ${repo.full_name}`);
    return ruleBasedAnalysis(repo);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ai-analyzer] API 调用失败 (${message})，降级到规则分析: ${repo.full_name}`);
    return ruleBasedAnalysis(repo);
  }
}

// 导出规则分析函数供测试使用
export { ruleBasedAnalysis, parseAIResponse, buildPrompt };
