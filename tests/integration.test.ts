import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GitHubRepo, NavItem, NavigationData } from '../src/types.js';

// ─── Mock 数据工厂 ────────────────────────────────────────────────────

function makeGitHubRepo(overrides: Partial<GitHubRepo> & { id: number; full_name: string }): GitHubRepo {
  const [owner, name] = overrides.full_name.split('/');
  return {
    name: name ?? 'test-repo',
    owner: { login: owner ?? 'test-owner' },
    html_url: `https://github.com/${overrides.full_name}`,
    description: `Description for ${overrides.full_name}`,
    stargazers_count: 100,
    forks_count: 10,
    updated_at: '2025-06-01T00:00:00Z',
    language: 'TypeScript',
    topics: ['claude-code'],
    archived: false,
    fork: false,
    ...overrides,
  };
}

function makeNavItem(overrides: Partial<NavItem> & { id: string }): NavItem {
  return {
    name: 'test-repo',
    owner: 'test-owner',
    url: 'https://github.com/test-owner/test-repo',
    description: 'A test repo',
    summary: 'Test summary',
    tags: ['test'],
    stars: 100,
    forks: 10,
    updated_at: '2025-01-01T00:00:00Z',
    content_type: 'other',
    score: 3,
    new: false,
    mirror_risk: false,
    original_analysis_likelihood: 'medium',
    ...overrides,
  };
}

// ─── Mock 外部依赖 ────────────────────────────────────────────────────

// Mock fetch（搜索 + AI 分析都用 fetch）
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock fs 模块
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock console 减少噪音
const consoleSpy = {
  info: vi.spyOn(console, 'info').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
};

// ─── 导入被测模块（在 mock 之后） ─────────────────────────────────────

import { runPipeline } from '../src/index.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

// ─── 测试 ─────────────────────────────────────────────────────────────

describe('Integration: full pipeline', () => {
  const mockRepos: GitHubRepo[] = [
    makeGitHubRepo({ id: 1, full_name: 'user/awesome-claude', stargazers_count: 5000, description: 'Awesome Claude Code list' }),
    makeGitHubRepo({ id: 2, full_name: 'user/claude-tutorial', stargazers_count: 2000, description: 'Claude Code tutorial guide' }),
    makeGitHubRepo({ id: 3, full_name: 'user/claude-tool', stargazers_count: 800, description: 'Claude Code CLI tool' }),
    makeGitHubRepo({ id: 4, full_name: 'user/claude-analysis', stargazers_count: 300, description: 'Claude Code source analysis' }),
    makeGitHubRepo({ id: 5, full_name: 'user/claude-security', stargazers_count: 150, description: 'Claude Code security research' }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock mkdir 成功
    vi.mocked(mkdir).mockResolvedValue(undefined);

    // Mock writeFile 成功
    vi.mocked(writeFile).mockResolvedValue(undefined);

    // Mock readFile（增量模式用）
    vi.mocked(readFile).mockRejectedValue(new Error('file not found'));

    // Mock fetch：搜索 API 返回仓库列表
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('api.github.com/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'X-RateLimit-Remaining': '50' }),
          json: () => Promise.resolve({
            total_count: mockRepos.length,
            items: mockRepos,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    });

    // 清除环境变量（使用规则分析降级）
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run full pipeline and write output files', async () => {
    await runPipeline({ incremental: false });

    // 验证 mkdir 被调用
    expect(mkdir).toHaveBeenCalled();

    // 验证 writeFile 被调用两次（JSON + README）
    expect(writeFile).toHaveBeenCalledTimes(2);

    // 验证 JSON 输出
    const jsonWriteCall = vi.mocked(writeFile).mock.calls.find(
      (call) => call[0].toString().includes('claude-code-nav.json'),
    );
    expect(jsonWriteCall).toBeDefined();
    const jsonData = JSON.parse(jsonWriteCall![1] as string) as NavigationData;
    expect(jsonData.source).toBe('github');
    expect(jsonData.schema_version).toBe('1.0.0');
    expect(jsonData.generated_at).toBeTruthy();
    expect(jsonData.categories.length).toBeGreaterThan(0);

    // 验证 README 输出
    const readmeWriteCall = vi.mocked(writeFile).mock.calls.find(
      (call) => call[0].toString().includes('README.md'),
    );
    expect(readmeWriteCall).toBeDefined();
    const readmeContent = readmeWriteCall![1] as string;
    expect(readmeContent).toContain('Claude Code Navigation');
    expect(readmeContent).toContain('Statistics');
  });

  it('should categorize repos correctly', async () => {
    await runPipeline({ incremental: false });

    const jsonWriteCall = vi.mocked(writeFile).mock.calls.find(
      (call) => call[0].toString().includes('claude-code-nav.json'),
    );
    const jsonData = JSON.parse(jsonWriteCall![1] as string) as NavigationData;

    const allItems = jsonData.categories.flatMap((c) => c.items);
    expect(allItems.length).toBeGreaterThan(0);

    // 验证每个 NavItem 结构完整
    for (const item of allItems) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.owner).toBeTruthy();
      expect(item.url).toContain('github.com');
      expect(typeof item.stars).toBe('number');
      expect(typeof item.score).toBe('number');
      expect(item.score).toBeGreaterThanOrEqual(1);
      expect(item.score).toBeLessThanOrEqual(5);
    }
  });

  it('should handle empty search results gracefully', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('api.github.com/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'X-RateLimit-Remaining': '50' }),
          json: () => Promise.resolve({
            total_count: 0,
            items: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    await runPipeline({ incremental: false });

    expect(writeFile).toHaveBeenCalledTimes(2);

    const jsonWriteCall = vi.mocked(writeFile).mock.calls.find(
      (call) => call[0].toString().includes('claude-code-nav.json'),
    );
    const jsonData = JSON.parse(jsonWriteCall![1] as string) as NavigationData;
    expect(jsonData.categories).toHaveLength(0);
  });

  it('should handle search API failure gracefully', async () => {
    mockFetch.mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers(),
      });
    });

    await runPipeline({ incremental: false });

    expect(writeFile).toHaveBeenCalledTimes(2);
    const jsonWriteCall = vi.mocked(writeFile).mock.calls.find(
      (call) => call[0].toString().includes('claude-code-nav.json'),
    );
    const jsonData = JSON.parse(jsonWriteCall![1] as string) as NavigationData;
    expect(jsonData.categories).toHaveLength(0);
  });
});

describe('Integration: --incremental flag', () => {
  const existingData: NavigationData = {
    generated_at: '2025-01-01T00:00:00Z',
    source: 'github',
    schema_version: '1.0.0',
    categories: [
      {
        key: 'other',
        label: '其他',
        items: [
          makeNavItem({
            id: 'user_existing-repo',
            name: 'existing-repo',
            owner: 'user',
            url: 'https://github.com/user/existing-repo',
            stars: 50,
            new: false,
          }),
        ],
      },
    ],
  };

  const newRepos: GitHubRepo[] = [
    makeGitHubRepo({ id: 10, full_name: 'user/new-repo', stargazers_count: 1000, description: 'New Claude Code tool' }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load existing data and merge when --incremental', async () => {
    // Mock readFile 返回已有数据
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(existingData));

    // Mock fetch 返回新仓库
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('api.github.com/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'X-RateLimit-Remaining': '50' }),
          json: () => Promise.resolve({
            total_count: newRepos.length,
            items: newRepos,
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    await runPipeline({ incremental: true });

    // 验证 readFile 被调用（加载已有数据）
    expect(readFile).toHaveBeenCalled();

    // 验证 JSON 输出包含合并后的数据
    const jsonWriteCall = vi.mocked(writeFile).mock.calls.find(
      (call) => call[0].toString().includes('claude-code-nav.json'),
    );
    expect(jsonWriteCall).toBeDefined();
    const jsonData = JSON.parse(jsonWriteCall![1] as string) as NavigationData;

    const allItems = jsonData.categories.flatMap((c) => c.items);
    // 已有仓库应标记为 unavailable（本次搜索未出现）
    const existingRepo = allItems.find((i) => i.id === 'user_existing-repo');
    expect(existingRepo).toBeDefined();
    expect(existingRepo?.unavailable).toBe(true);
  });

  it('should fall back to full scan when existing data is missing', async () => {
    // Mock readFile 失败（文件不存在）
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('api.github.com/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'X-RateLimit-Remaining': '50' }),
          json: () => Promise.resolve({
            total_count: newRepos.length,
            items: newRepos,
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    await runPipeline({ incremental: true });

    // 即使增量模式，文件不存在也应正常完成
    expect(writeFile).toHaveBeenCalledTimes(2);
  });

  it('should fall back to full scan when existing data is malformed', async () => {
    // Mock readFile 返回畸形 JSON
    vi.mocked(readFile).mockResolvedValue('{broken json');

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('api.github.com/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'X-RateLimit-Remaining': '50' }),
          json: () => Promise.resolve({
            total_count: newRepos.length,
            items: newRepos,
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    await runPipeline({ incremental: true });

    expect(writeFile).toHaveBeenCalledTimes(2);

    const jsonWriteCall = vi.mocked(writeFile).mock.calls.find(
      (call) => call[0].toString().includes('claude-code-nav.json'),
    );
    const jsonData = JSON.parse(jsonWriteCall![1] as string) as NavigationData;
    // 畸形数据回退，使用全新数据
    expect(jsonData.categories.length).toBeGreaterThan(0);
  });
});

describe('Integration: deduplication in pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should deduplicate repos across multiple search queries', async () => {
    const duplicateRepo = makeGitHubRepo({ id: 1, full_name: 'user/popular-repo', stargazers_count: 5000 });

    // 每次搜索都返回相同的仓库（模拟多个查询命中同一仓库）
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('api.github.com/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'X-RateLimit-Remaining': '50' }),
          json: () => Promise.resolve({
            total_count: 1,
            items: [duplicateRepo],
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    await runPipeline({ incremental: false });

    const jsonWriteCall = vi.mocked(writeFile).mock.calls.find(
      (call) => call[0].toString().includes('claude-code-nav.json'),
    );
    const jsonData = JSON.parse(jsonWriteCall![1] as string) as NavigationData;
    const allItems = jsonData.categories.flatMap((c) => c.items);

    // 同一个仓库不应重复出现
    const popularRepoCount = allItems.filter((i) => i.id === 'user_popular-repo').length;
    expect(popularRepoCount).toBe(1);
  });
});
