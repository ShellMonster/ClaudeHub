import { describe, it, expect } from 'vitest';
import { deduplicate, normalizeUrl } from '../src/dedup.js';
import type { GitHubRepo } from '../src/types.js';

/** 创建测试用 GitHubRepo 的工厂函数 */
function makeRepo(overrides: Partial<GitHubRepo> & Pick<GitHubRepo, 'id' | 'full_name'>): GitHubRepo {
  const [owner, name] = overrides.full_name.split('/');
  return {
    name: name ?? overrides.full_name,
    owner: { login: owner ?? 'test' },
    html_url: `https://github.com/${overrides.full_name}`,
    description: null,
    stargazers_count: 100,
    forks_count: 10,
    updated_at: '2025-01-01T00:00:00Z',
    language: 'TypeScript',
    topics: [],
    archived: false,
    fork: false,
    ...overrides,
  };
}

describe('deduplicate', () => {
  describe('ID-based deduplication', () => {
    it('removes duplicates by repo.id, keeping higher-starred version', () => {
      const repos = [
        makeRepo({ id: 1, full_name: 'user/repo-a', stargazers_count: 50 }),
        makeRepo({ id: 2, full_name: 'user/repo-b', stargazers_count: 100 }),
        makeRepo({ id: 1, full_name: 'user/repo-a-renamed', stargazers_count: 200 }),
      ];

      const result = deduplicate(repos);

      expect(result).toHaveLength(2);
      expect(result.find(r => r.id === 1)?.stargazers_count).toBe(200);
      expect(result.find(r => r.id === 2)).toBeDefined();
    });

    it('keeps higher-starred version when same ID appears', () => {
      const repos = [
        makeRepo({ id: 1, full_name: 'user/repo-a', stargazers_count: 50 }),
        makeRepo({ id: 1, full_name: 'user/repo-a', stargazers_count: 200 }),
      ];

      const result = deduplicate(repos);

      expect(result).toHaveLength(1);
      expect(result[0].stargazers_count).toBe(200);
    });

    it('handles empty input', () => {
      expect(deduplicate([])).toEqual([]);
    });

    it('handles single repo', () => {
      const repo = makeRepo({ id: 1, full_name: 'user/repo' });
      expect(deduplicate([repo])).toHaveLength(1);
    });
  });

  describe('Fork filtering', () => {
    it('excludes low-value fork (stars < 10% of parent)', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/forked-repo',
          fork: true,
          stargazers_count: 5,
          description: 'short',
        }),
      ];

      const parentStarsMap = new Map<number, number>([[1, 1000]]);
      const result = deduplicate(repos, parentStarsMap);

      expect(result).toHaveLength(0);
    });

    it('keeps high-value fork (stars >= 10% of parent)', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/popular-fork',
          fork: true,
          stargazers_count: 150,
        }),
      ];

      const parentStarsMap = new Map<number, number>([[1, 1000]]);
      const result = deduplicate(repos, parentStarsMap);

      expect(result).toHaveLength(1);
      expect(result[0].full_name).toBe('user/popular-fork');
    });

    it('keeps fork with unique description even if low stars', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/fork-with-desc',
          fork: true,
          stargazers_count: 5,
          description: 'This is a unique and detailed fork description with custom changes',
        }),
      ];

      const parentStarsMap = new Map<number, number>([[1, 1000]]);
      const result = deduplicate(repos, parentStarsMap);

      expect(result).toHaveLength(1);
    });

    it('keeps fork when no parent info available', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/fork-no-parent',
          fork: true,
          stargazers_count: 1,
        }),
      ];

      const result = deduplicate(repos);

      expect(result).toHaveLength(1);
    });

    it('keeps non-fork repos regardless of stars', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/original-repo',
          fork: false,
          stargazers_count: 1,
        }),
      ];

      const result = deduplicate(repos);

      expect(result).toHaveLength(1);
    });
  });

  describe('Leak source exclusion', () => {
    it('excludes repos with sourcemap in name', () => {
      const repos = [
        makeRepo({ id: 1, full_name: 'user/sourcemap-leak' }),
      ];

      const result = deduplicate(repos);
      expect(result).toHaveLength(0);
    });

    it('excludes repos with source-code-leak in description', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/some-repo',
          description: 'A source-code-leak discovery tool',
        }),
      ];

      const result = deduplicate(repos);
      expect(result).toHaveLength(0);
    });

    it('excludes repos with leaked-claude-code in name', () => {
      const repos = [
        makeRepo({ id: 1, full_name: 'user/leaked-claude-code-dump' }),
      ];

      const result = deduplicate(repos);
      expect(result).toHaveLength(0);
    });

    it('excludes repos with deobfuscat in description', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/tool',
          description: 'Deobfuscator for leaked source code',
        }),
      ];

      const result = deduplicate(repos);
      expect(result).toHaveLength(0);
    });

    it('keeps analysis repos even with leak keywords', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/sourcemap-analysis',
          description: 'Security analysis of sourcemap leaks',
        }),
      ];

      const result = deduplicate(repos);
      expect(result).toHaveLength(1);
    });

    it('keeps repos with research keyword and leak keyword', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/source-code-leak-research',
          description: 'Research into source code leak prevention',
        }),
      ];

      const result = deduplicate(repos);
      expect(result).toHaveLength(1);
    });

    it('keeps normal repos without leak keywords', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/awesome-tool',
          description: 'A great development tool',
        }),
      ];

      const result = deduplicate(repos);
      expect(result).toHaveLength(1);
    });
  });

  describe('Content similarity (identical descriptions)', () => {
    it('keeps higher-starred repo when descriptions are identical', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/repo-low',
          description: 'Claude Code navigation helper',
          stargazers_count: 50,
        }),
        makeRepo({
          id: 2,
          full_name: 'user/repo-high',
          description: 'Claude Code navigation helper',
          stargazers_count: 500,
        }),
      ];

      const result = deduplicate(repos);

      expect(result).toHaveLength(1);
      expect(result[0].stargazers_count).toBe(500);
    });

    it('keeps both repos with different descriptions', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/repo-a',
          description: 'Tool for X',
          stargazers_count: 50,
        }),
        makeRepo({
          id: 2,
          full_name: 'user/repo-b',
          description: 'Tool for Y',
          stargazers_count: 500,
        }),
      ];

      const result = deduplicate(repos);

      expect(result).toHaveLength(2);
    });

    it('handles case-insensitive description comparison', () => {
      const repos = [
        makeRepo({
          id: 1,
          full_name: 'user/repo-a',
          description: 'CLAUDE CODE TOOL',
          stargazers_count: 50,
        }),
        makeRepo({
          id: 2,
          full_name: 'user/repo-b',
          description: 'claude code tool',
          stargazers_count: 500,
        }),
      ];

      const result = deduplicate(repos);

      expect(result).toHaveLength(1);
      expect(result[0].stargazers_count).toBe(500);
    });

    it('keeps both repos with null descriptions', () => {
      const repos = [
        makeRepo({ id: 1, full_name: 'user/repo-a', description: null }),
        makeRepo({ id: 2, full_name: 'user/repo-b', description: null }),
      ];

      const result = deduplicate(repos);

      expect(result).toHaveLength(2);
    });
  });

  describe('Combined scenarios', () => {
    it('processes a realistic mixed input', () => {
      const repos = [
        makeRepo({ id: 1, full_name: 'user/awesome-claude', stargazers_count: 1000, description: 'Awesome Claude tools' }),
        makeRepo({ id: 1, full_name: 'user/awesome-claude', stargazers_count: 800, description: 'Awesome Claude tools' }),
        makeRepo({ id: 2, full_name: 'user/sourcemap-dump', description: 'sourcemap leak dump' }),
        makeRepo({ id: 3, full_name: 'user/claude-fork', fork: true, stargazers_count: 5, description: 'hi' }),
        makeRepo({ id: 4, full_name: 'user/claude-analysis', stargazers_count: 200, description: 'sourcemap analysis report' }),
        makeRepo({ id: 5, full_name: 'user/claude-tool', stargazers_count: 300, description: 'Awesome Claude tools' }),
      ];

      const parentStarsMap = new Map<number, number>([[3, 1000]]);
      const result = deduplicate(repos, parentStarsMap);

      // id=1 (deduped, first wins at 1000), id=2 (leak excluded), id=3 (low-value fork excluded),
      // id=4 (analysis repo kept), id=5 (same desc as id=1, lower stars → excluded)
      expect(result).toHaveLength(2);
      expect(result.find(r => r.id === 1)?.stargazers_count).toBe(1000);
      expect(result.find(r => r.id === 4)).toBeDefined();
    });
  });
});

describe('normalizeUrl', () => {
  it('removes trailing slash', () => {
    expect(normalizeUrl('https://github.com/owner/repo/')).toBe('https://github.com/owner/repo');
  });

  it('lowercases owner/repo', () => {
    expect(normalizeUrl('https://github.com/Owner/Repo')).toBe('https://github.com/owner/repo');
  });

  it('removes .git suffix', () => {
    expect(normalizeUrl('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
  });

  it('converts http to https', () => {
    expect(normalizeUrl('http://github.com/owner/repo')).toBe('https://github.com/owner/repo');
  });

  it('handles all normalizations combined', () => {
    expect(normalizeUrl('http://github.com/Owner/Repo.git/')).toBe('https://github.com/owner/repo');
  });

  it('handles already-normalized URL', () => {
    expect(normalizeUrl('https://github.com/owner/repo')).toBe('https://github.com/owner/repo');
  });

  it('handles multiple trailing slashes', () => {
    expect(normalizeUrl('https://github.com/owner/repo///')).toBe('https://github.com/owner/repo');
  });
});
