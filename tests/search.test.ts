/**
 * searchRepos 单元测试
 * Mock fetch 测试分页、速率限制、空结果和 5xx 重试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchRepos } from '../src/search.js';
import type { GitHubRepo } from '../src/types.js';

/** 构造一个模拟的 GitHubRepo 对象 */
function mockRepo(id: number, name: string): GitHubRepo {
  return {
    id,
    full_name: `test/${name}`,
    name,
    owner: { login: 'test' },
    html_url: `https://github.com/test/${name}`,
    description: `Test repo ${name}`,
    stargazers_count: id * 10,
    forks_count: id,
    updated_at: '2025-01-01T00:00:00Z',
    language: 'TypeScript',
    topics: [],
    archived: false,
    fork: false,
  };
}

/** 构造 GitHub 搜索 API 响应体 */
function mockSearchResponse(items: GitHubRepo[], totalCount: number) {
  return {
    total_count: totalCount,
    incomplete_results: false,
    items,
  };
}

/** 构造标准响应头（速率限制充足） */
function defaultHeaders(): Record<string, string> {
  return {
    'X-RateLimit-Remaining': '60',
    'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + 3600),
  };
}

describe('searchRepos', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('应正确处理分页（2 页结果）', async () => {
    const page1Items = Array.from({ length: 100 }, (_, i) => mockRepo(i + 1, `repo-p1-${i}`));
    const page2Items = Array.from({ length: 50 }, (_, i) => mockRepo(i + 101, `repo-p2-${i}`));
    const totalCount = 150;

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      const urlObj = new URL(url.toString());
      const page = parseInt(urlObj.searchParams.get('page') ?? '1', 10);

      if (page === 1) {
        return new Response(JSON.stringify(mockSearchResponse(page1Items, totalCount)), {
          status: 200,
          headers: defaultHeaders(),
        });
      }
      return new Response(JSON.stringify(mockSearchResponse(page2Items, totalCount)), {
        status: 200,
        headers: defaultHeaders(),
      });
    });

    const result = await searchRepos({ query: 'test', sort: 'stars', perPage: 100 });

    expect(result).toHaveLength(150);
    expect(callCount).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('应正确处理空结果', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockSearchResponse([], 0)), {
        status: 200,
        headers: defaultHeaders(),
      })
    );

    const result = await searchRepos({ query: 'nonexistent-query-xyz', sort: 'stars', perPage: 100 });

    expect(result).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('应在速率限制接近阈值时等待', async () => {
    const items = [mockRepo(1, 'repo-1')];
    const resetTime = Math.ceil(Date.now() / 1000) + 2;

    // Mock setTimeout 以避免实际等待
    vi.useFakeTimers();

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockSearchResponse(items, 1)), {
        status: 200,
        headers: {
          'X-RateLimit-Remaining': '3',
          'X-RateLimit-Reset': String(resetTime),
        },
      })
    );

    const searchPromise = searchRepos({ query: 'test', sort: 'stars', perPage: 100 });

    // 快进定时器以解除 sleep
    await vi.advanceTimersByTimeAsync(3000);

    const result = await searchPromise;
    expect(result).toHaveLength(1);

    vi.useRealTimers();
  });

  it('应在遇到 5xx 错误时重试', async () => {
    const items = [mockRepo(1, 'repo-1')];
    let callCount = 0;

    vi.useFakeTimers();

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        return new Response('Internal Server Error', { status: 500 });
      }
      return new Response(JSON.stringify(mockSearchResponse(items, 1)), {
        status: 200,
        headers: defaultHeaders(),
      });
    });

    const searchPromise = searchRepos({ query: 'test', sort: 'stars', perPage: 100 });

    // 快进定时器以跳过重试延迟
    await vi.advanceTimersByTimeAsync(5000);

    const result = await searchPromise;
    expect(result).toHaveLength(1);
    expect(callCount).toBe(3);

    vi.useRealTimers();
  });

  it('应在超过最大重试次数后抛出错误', async () => {
    vi.useFakeTimers();

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Service Unavailable', { status: 503 })
    );

    const searchPromise = searchRepos({ query: 'test', sort: 'stars', perPage: 100 });
    searchPromise.catch(() => {});

    await vi.advanceTimersByTimeAsync(30000);

    await expect(searchPromise).rejects.toThrow('GitHub API 服务器错误: 503');

    vi.useRealTimers();
  });

  it('应在请求头中包含 GITHUB_TOKEN', async () => {
    process.env.GITHUB_TOKEN = 'test-token-123';
    const items = [mockRepo(1, 'repo-1')];

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockSearchResponse(items, 1)), {
        status: 200,
        headers: defaultHeaders(),
      })
    );

    await searchRepos({ query: 'test', sort: 'stars', perPage: 100 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    );

    delete process.env.GITHUB_TOKEN;
  });

  it('应在单页结果时停止分页', async () => {
    const items = Array.from({ length: 30 }, (_, i) => mockRepo(i + 1, `repo-${i}`));

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockSearchResponse(items, 30)), {
        status: 200,
        headers: defaultHeaders(),
      })
    );

    const result = await searchRepos({ query: 'test', sort: 'stars', perPage: 100 });

    expect(result).toHaveLength(30);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
