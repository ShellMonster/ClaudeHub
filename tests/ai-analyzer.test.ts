import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeRepo, ruleBasedAnalysis, parseAIResponse, buildPrompt } from '../src/ai-analyzer.js';
import type { GitHubRepo } from '../src/types.js';

// ─── 测试数据 ─────────────────────────────────────────────────────────

const mockRepo: GitHubRepo = {
  id: 1,
  full_name: 'test/repo',
  name: 'repo',
  owner: { login: 'test' },
  html_url: 'https://github.com/test/repo',
  description: 'A test repository for analysis',
  stargazers_count: 500,
  forks_count: 50,
  updated_at: '2025-01-01T00:00:00Z',
  language: 'TypeScript',
  topics: ['cli', 'tool'],
  archived: false,
  fork: false,
};

const validAIResponse = JSON.stringify({
  category: 'tooling',
  tags: ['cli', 'tool', 'typescript'],
  summary: 'A CLI tool for testing',
  score: 4,
  mirror_risk: false,
  original_analysis_likelihood: 'high',
});

// ─── 环境变量管理 ─────────────────────────────────────────────────────

function setEnvVars() {
  process.env.ANTHROPIC_BASE_URL = 'https://api.example.com';
  process.env.ANTHROPIC_API_KEY = 'test-key-123';
  process.env.ANTHROPIC_MODEL = 'test-model';
}

function clearEnvVars() {
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
}

// ─── Mock fetch 辅助 ──────────────────────────────────────────────────

function mockFetchSuccess(body: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(body),
  }));
}

function mockFetchError(status: number, statusText = 'Error'): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    headers: new Headers(),
  }));
}

function mockFetchNetworkError(): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
}

function createAPIResponse(text: string) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    model: 'test-model',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

// ─── 测试 ─────────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  it('should include repo info in user prompt', () => {
    const { system, user } = buildPrompt(mockRepo);
    expect(user).toContain(mockRepo.name);
    expect(user).toContain(mockRepo.owner.login);
    expect(user).toContain(mockRepo.description!);
    expect(user).toContain(String(mockRepo.stargazers_count));
    expect(user).toContain(mockRepo.language!);
    expect(user).toContain(mockRepo.topics.join(', '));
  });

  it('should include JSON schema instructions in system prompt', () => {
    const { system } = buildPrompt(mockRepo);
    expect(system).toContain('category');
    expect(system).toContain('tags');
    expect(system).toContain('summary');
    expect(system).toContain('score');
    expect(system).toContain('mirror_risk');
    expect(system).toContain('original_analysis_likelihood');
  });

  it('should handle null description', () => {
    const repo = { ...mockRepo, description: null };
    const { user } = buildPrompt(repo);
    expect(user).toContain('(no description)');
  });
});

describe('parseAIResponse', () => {
  it('should parse valid JSON response', () => {
    const result = parseAIResponse(validAIResponse);
    expect(result).toEqual({
      category: 'tooling',
      tags: ['cli', 'tool', 'typescript'],
      summary: 'A CLI tool for testing',
      score: 4,
      mirror_risk: false,
      original_analysis_likelihood: 'high',
    });
  });

  it('should parse JSON wrapped in markdown code fence', () => {
    const fenced = '```json\n' + validAIResponse + '\n```';
    const result = parseAIResponse(fenced);
    expect(result).not.toBeNull();
    expect(result!.category).toBe('tooling');
  });

  it('should parse JSON wrapped in plain code fence', () => {
    const fenced = '```\n' + validAIResponse + '\n```';
    const result = parseAIResponse(fenced);
    expect(result).not.toBeNull();
    expect(result!.category).toBe('tooling');
  });

  it('should return null for invalid JSON', () => {
    expect(parseAIResponse('not json at all')).toBeNull();
  });

  it('should return null for JSON with invalid category', () => {
    const invalid = JSON.stringify({ ...JSON.parse(validAIResponse), category: 'invalid_cat' });
    expect(parseAIResponse(invalid)).toBeNull();
  });

  it('should return null for JSON with missing fields', () => {
    const partial = JSON.stringify({ category: 'tooling' });
    expect(parseAIResponse(partial)).toBeNull();
  });

  it('should return null for score out of range', () => {
    const outOfRange = JSON.stringify({ ...JSON.parse(validAIResponse), score: 10 });
    expect(parseAIResponse(outOfRange)).toBeNull();
  });

  it('should return null for invalid likelihood', () => {
    const invalid = JSON.stringify({ ...JSON.parse(validAIResponse), original_analysis_likelihood: 'maybe' });
    expect(parseAIResponse(invalid)).toBeNull();
  });

  it('should truncate tags to max 5', () => {
    const manyTags = JSON.stringify({
      ...JSON.parse(validAIResponse),
      tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    const result = parseAIResponse(manyTags);
    expect(result!.tags).toHaveLength(5);
  });

  it('should truncate summary to max 100 chars', () => {
    const longSummary = JSON.stringify({
      ...JSON.parse(validAIResponse),
      summary: 'x'.repeat(200),
    });
    const result = parseAIResponse(longSummary);
    expect(result!.summary.length).toBeLessThanOrEqual(100);
  });
});

describe('ruleBasedAnalysis', () => {
  it('should classify tutorial repo by keywords', () => {
    const repo: GitHubRepo = {
      ...mockRepo,
      name: 'awesome-tutorial',
      description: 'A comprehensive tutorial for beginners',
      topics: ['tutorial', 'learning'],
    };
    const result = ruleBasedAnalysis(repo);
    expect(result.category).toBe('tutorial');
  });

  it('should classify awesome-list by keywords', () => {
    const repo: GitHubRepo = {
      ...mockRepo,
      name: 'awesome-react',
      description: 'A curated list of React resources',
      topics: ['awesome', 'react'],
    };
    const result = ruleBasedAnalysis(repo);
    expect(result.category).toBe('awesome_list');
  });

  it('should classify security repo by keywords', () => {
    const repo: GitHubRepo = {
      ...mockRepo,
      name: 'security-tools',
      description: 'Penetration testing and vulnerability scanner',
      topics: ['security', 'pentest'],
    };
    const result = ruleBasedAnalysis(repo);
    expect(result.category).toBe('security');
  });

  it('should default to other when no keywords match', () => {
    const repo: GitHubRepo = {
      ...mockRepo,
      name: 'random-project',
      description: 'Something completely unrelated',
      topics: [],
    };
    const result = ruleBasedAnalysis(repo);
    expect(result.category).toBe('other');
  });

  it('should assign score based on stars', () => {
    expect(ruleBasedAnalysis({ ...mockRepo, stargazers_count: 15000 }).score).toBe(5);
    expect(ruleBasedAnalysis({ ...mockRepo, stargazers_count: 5000 }).score).toBe(4);
    expect(ruleBasedAnalysis({ ...mockRepo, stargazers_count: 500 }).score).toBe(3);
    expect(ruleBasedAnalysis({ ...mockRepo, stargazers_count: 50 }).score).toBe(2);
    expect(ruleBasedAnalysis({ ...mockRepo, stargazers_count: 5 }).score).toBe(1);
  });

  it('should detect mirror risk for forked repos with low stars', () => {
    const forked = { ...mockRepo, fork: true, stargazers_count: 10 };
    expect(ruleBasedAnalysis(forked).mirror_risk).toBe(true);
  });

  it('should not flag mirror risk for non-fork repos', () => {
    expect(ruleBasedAnalysis(mockRepo).mirror_risk).toBe(false);
  });

  it('should use topics as tags', () => {
    const repo: GitHubRepo = { ...mockRepo, topics: ['react', 'node', 'cli'] };
    const result = ruleBasedAnalysis(repo);
    expect(result.tags).toContain('react');
    expect(result.tags).toContain('node');
  });

  it('should fall back to language when topics are empty', () => {
    const repo: GitHubRepo = { ...mockRepo, topics: [], language: 'Rust' };
    const result = ruleBasedAnalysis(repo);
    expect(result.tags).toContain('rust');
  });

  it('should use owner/name as summary when description is null', () => {
    const repo: GitHubRepo = { ...mockRepo, description: null };
    const result = ruleBasedAnalysis(repo);
    expect(result.summary).toContain('test/repo');
  });

  it('should always return a valid AIAnalysisResult', () => {
    const result = ruleBasedAnalysis(mockRepo);
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('tags');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('mirror_risk');
    expect(result).toHaveProperty('original_analysis_likelihood');
    expect([1, 2, 3, 4, 5]).toContain(result.score);
    expect(['high', 'medium', 'low']).toContain(result.original_analysis_likelihood);
  });
});

describe('analyzeRepo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearEnvVars();
    vi.restoreAllMocks();
  });

  it('should use rule-based analysis when env vars are missing', async () => {
    clearEnvVars();
    const result = await analyzeRepo(mockRepo);
    expect(result.category).toBeDefined();
    expect(result.tags).toBeInstanceOf(Array);
    expect(typeof result.summary).toBe('string');
  });

  it('should parse successful AI response', async () => {
    setEnvVars();
    mockFetchSuccess(createAPIResponse(validAIResponse));

    const result = await analyzeRepo(mockRepo);
    expect(result.category).toBe('tooling');
    expect(result.tags).toEqual(['cli', 'tool', 'typescript']);
    expect(result.score).toBe(4);
    expect(result.mirror_risk).toBe(false);
    expect(result.original_analysis_likelihood).toBe('high');
  });

  it('should fallback to rules when AI returns invalid JSON', async () => {
    setEnvVars();
    mockFetchSuccess(createAPIResponse('this is not valid json'));

    const result = await analyzeRepo(mockRepo);
    expect(result.category).toBeDefined();
    expect(result.tags).toBeInstanceOf(Array);
    // Should be a rule-based result, not AI
    expect(result.original_analysis_likelihood).toBeDefined();
  });

  it('should fallback to rules when API returns 4xx error', async () => {
    setEnvVars();
    mockFetchError(400, 'Bad Request');

    const result = await analyzeRepo(mockRepo);
    expect(result.category).toBeDefined();
    expect(result.tags).toBeInstanceOf(Array);
  });

  it('should fallback to rules after retries on 5xx error', async () => {
    setEnvVars();
    mockFetchError(500, 'Internal Server Error');

    const result = await analyzeRepo(mockRepo);
    expect(result.category).toBeDefined();
    expect(result.tags).toBeInstanceOf(Array);
  }, 15000);

  it('should fallback to rules after retries on network error', async () => {
    setEnvVars();
    mockFetchNetworkError();

    const result = await analyzeRepo(mockRepo);
    expect(result.category).toBeDefined();
    expect(result.tags).toBeInstanceOf(Array);
  }, 15000);

  it('should fallback to rules after retries on 429 rate limit', async () => {
    setEnvVars();
    mockFetchError(429, 'Too Many Requests');

    const result = await analyzeRepo(mockRepo);
    expect(result.category).toBeDefined();
  }, 30000);

  it('should send correct headers to API', async () => {
    setEnvVars();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve(createAPIResponse(validAIResponse)),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await analyzeRepo(mockRepo);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.example.com/chat/completions');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['Authorization']).toBe('Bearer test-key-123');

    const body = JSON.parse(options.body);
    expect(body.model).toBe('test-model');
    expect(body.messages).toBeInstanceOf(Array);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
  });

  it('should handle AI response with markdown code fences', async () => {
    setEnvVars();
    const fencedResponse = '```json\n' + validAIResponse + '\n```';
    mockFetchSuccess(createAPIResponse(fencedResponse));

    const result = await analyzeRepo(mockRepo);
    expect(result.category).toBe('tooling');
  });

  it('should always return a valid AIAnalysisResult', async () => {
    clearEnvVars();
    const result = await analyzeRepo(mockRepo);
    expect([1, 2, 3, 4, 5]).toContain(result.score);
    expect(['high', 'medium', 'low']).toContain(result.original_analysis_likelihood);
    expect(typeof result.mirror_risk).toBe('boolean');
    expect(typeof result.summary).toBe('string');
    expect(Array.isArray(result.tags)).toBe(true);
  });
});
