/**
 * GitHub REST API 搜索客户端
 * 使用原生 fetch 实现，支持分页、速率限制和重试
 */

import type { SearchConfig, GitHubRepo } from './types.js';

/** 最大页数限制（GitHub API 最多返回 1000 条结果） */
const MAX_PAGES = 10;

/** 最大重试次数 */
const MAX_RETRIES = 3;

/** 基础重试延迟（毫秒） */
const BASE_RETRY_DELAY = 1000;

/** 速率限制安全阈值 */
const RATE_LIMIT_THRESHOLD = 5;

/**
 * 休眠指定毫秒数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 构建请求头（包含认证信息）
 */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 检查速率限制，必要时等待
 */
async function checkRateLimit(headers: Headers): Promise<void> {
  const remaining = parseInt(headers.get('X-RateLimit-Remaining') ?? '60', 10);
  if (remaining < RATE_LIMIT_THRESHOLD) {
    const resetTime = parseInt(headers.get('X-RateLimit-Reset') ?? '0', 10);
    const waitMs = Math.max(resetTime * 1000 - Date.now(), 1000);
    console.warn(
      `[search] 速率限制接近阈值 (剩余: ${remaining})，等待 ${Math.ceil(waitMs / 1000)} 秒...`
    );
    await sleep(waitMs);
  }
}

/**
 * 带重试的 fetch 请求（仅对 5xx 错误重试）
 */
async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, { headers });

    if (response.status >= 500 && response.status < 600) {
      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
      console.warn(
        `[search] 服务器错误 ${response.status}，第 ${attempt + 1} 次重试，等待 ${delay}ms...`
      );
      await sleep(delay);
      lastError = new Error(`GitHub API 服务器错误: ${response.status}`);
      continue;
    }

    if (!response.ok) {
      throw new Error(`GitHub API 请求失败: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  throw lastError ?? new Error('GitHub API 请求失败: 超过最大重试次数');
}

/**
 * 搜索 GitHub 仓库
 *
 * @param config 搜索配置（关键词、排序方式、每页数量）
 * @returns 匹配的仓库列表
 */
export async function searchRepos(config: SearchConfig): Promise<GitHubRepo[]> {
  const { query, sort, perPage } = config;
  const headers = buildHeaders();
  const allRepos: GitHubRepo[] = [];
  let totalCount = Infinity;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&per_page=${perPage}&page=${page}`;

    const response = await fetchWithRetry(url, headers);

    // 检查速率限制
    await checkRateLimit(response.headers);

    const data = (await response.json()) as {
      total_count: number;
      items: GitHubRepo[];
    };

    // 首次获取总数
    if (page === 1) {
      totalCount = data.total_count;
    }

    // 空结果处理
    if (!data.items || data.items.length === 0) {
      if (page === 1) {
        console.warn(`[search] 搜索 "${query}" 无结果`);
      }
      break;
    }

    allRepos.push(...data.items);

    // 已获取全部结果，停止分页
    if (allRepos.length >= totalCount) {
      break;
    }
  }

  console.info(`[search] 搜索 "${query}" 完成，共获取 ${allRepos.length}/${totalCount} 个仓库`);
  return allRepos;
}
