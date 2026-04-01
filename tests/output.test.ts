import { describe, it, expect } from 'vitest';
import { generateJson, stringifyJson } from '../src/output-json.js';
import { generateReadme } from '../src/output-readme.js';
import type { CategorySection, NavItem, NavigationData } from '../src/types.js';

function mockNavItem(overrides: Partial<NavItem> = {}): NavItem {
  return {
    id: 'test_repo',
    name: 'test-repo',
    owner: 'test',
    url: 'https://github.com/test/test-repo',
    description: 'A test repository',
    summary: 'Test summary',
    tags: ['test'],
    stars: 100,
    forks: 10,
    updated_at: '2025-01-01T00:00:00Z',
    content_type: 'code',
    score: 3,
    new: false,
    mirror_risk: false,
    original_analysis_likelihood: 'medium',
    ...overrides,
  };
}

function mockCategories(): CategorySection[] {
  return [
    {
      key: 'source_analysis',
      label: '源码分析',
      items: [
        mockNavItem({ id: 'a_low', name: 'low-score', score: 2, stars: 50 }),
        mockNavItem({ id: 'a_high', name: 'high-score', score: 5, stars: 500 }),
        mockNavItem({ id: 'a_mid', name: 'mid-score', score: 3, stars: 100 }),
      ],
    },
    {
      key: 'tutorial',
      label: '教程指南',
      items: [
        mockNavItem({ id: 't1', name: 'tut-repo', score: 4, stars: 200 }),
      ],
    },
    {
      key: 'tooling',
      label: '工具集成',
      items: [],
    },
  ];
}

describe('generateJson', () => {
  it('should return valid NavigationData structure', () => {
    const categories = mockCategories();
    const result = generateJson(categories);

    expect(result).toHaveProperty('generated_at');
    expect(result).toHaveProperty('source', 'github');
    expect(result).toHaveProperty('schema_version', '1.0.0');
    expect(result).toHaveProperty('categories');
    expect(result.categories).toHaveLength(3);
  });

  it('should sort items by score descending within each category', () => {
    const categories = mockCategories();
    const result = generateJson(categories);

    const analysisItems = result.categories[0].items;
    expect(analysisItems[0].score).toBe(5);
    expect(analysisItems[1].score).toBe(3);
    expect(analysisItems[2].score).toBe(2);
  });

  it('should generate valid ISO8601 timestamp', () => {
    const result = generateJson(mockCategories());
    const timestamp = new Date(result.generated_at);
    expect(timestamp.getTime()).not.toBeNaN();
    expect(result.generated_at).toContain('T');
  });

  it('should not mutate original categories', () => {
    const categories = mockCategories();
    const originalOrder = categories[0].items.map((i) => i.id);
    generateJson(categories);
    expect(categories[0].items.map((i) => i.id)).toEqual(originalOrder);
  });

  it('should handle empty categories array', () => {
    const result = generateJson([]);
    expect(result.categories).toEqual([]);
    expect(result.source).toBe('github');
  });
});

describe('stringifyJson', () => {
  it('should produce valid formatted JSON', () => {
    const data = generateJson(mockCategories());
    const str = stringifyJson(data);
    const parsed = JSON.parse(str);
    expect(parsed).toEqual(data);
  });

  it('should use 2-space indentation', () => {
    const data = generateJson([]);
    const str = stringifyJson(data);
    expect(str).toContain('  "source": "github"');
  });
});

describe('generateReadme', () => {
  function makeReadmeData(): NavigationData {
    return {
      generated_at: '2025-06-15T12:00:00Z',
      source: 'github',
      schema_version: '1.0.0',
      categories: [
        {
          key: 'source_analysis',
          label: '源码分析',
          items: [
            mockNavItem({ name: 'repo-a', score: 5, stars: 1000, summary: 'Great analysis repo' }),
            mockNavItem({ name: 'repo-b', score: 3, stars: 500, summary: 'Another repo' }),
          ],
        },
        {
          key: 'tutorial',
          label: '教程指南',
          items: [
            mockNavItem({ name: 'tut-1', score: 4, stars: 300, summary: 'Tutorial repo' }),
          ],
        },
      ],
    };
  }

  it('should contain title', () => {
    const readme = generateReadme(makeReadmeData());
    expect(readme).toContain('# Claude Code Navigation');
  });

  it('should contain overview section with stats', () => {
    const readme = generateReadme(makeReadmeData());
    expect(readme).toContain('## 📊 Overview');
    expect(readme).toContain('Total Repositories');
    expect(readme).toContain('3');
  });

  it('should contain category sections with headings', () => {
    const readme = generateReadme(makeReadmeData());
    expect(readme).toContain('## 🔬 源码分析');
    expect(readme).toContain('## 📚 教程指南');
  });

  it('should contain tables with rank and score columns', () => {
    const readme = generateReadme(makeReadmeData());
    expect(readme).toContain('| # | Repository | Description | Stars | Score |');
  });

  it('should mark archived repos with 📦', () => {
    const data: NavigationData = {
      generated_at: '2025-06-15T12:00:00Z',
      source: 'github',
      schema_version: '1.0.0',
      categories: [
        {
          key: 'other',
          label: '其他',
          items: [
            mockNavItem({ name: 'archived-repo', unavailable: true, stars: 50 }),
          ],
        },
      ],
    };
    const readme = generateReadme(data);
    expect(readme).toContain('📦 [archived-repo]');
  });

  it('should truncate descriptions over 150 chars', () => {
    const longDesc = 'A'.repeat(250);
    const data: NavigationData = {
      generated_at: '2025-06-15T12:00:00Z',
      source: 'github',
      schema_version: '1.0.0',
      categories: [
        {
          key: 'other',
          label: '其他',
          items: [
            mockNavItem({ name: 'long-desc', summary: longDesc }),
          ],
        },
      ],
    };
    const readme = generateReadme(data);
    const truncatedInReadme = readme.match(/\| \d+ \| \[long-desc\].*\| (.+?) \|/);
    expect(truncatedInReadme).toBeTruthy();
    expect(truncatedInReadme![1].length).toBeLessThanOrEqual(153);
  });

  it('should hide empty categories', () => {
    const data: NavigationData = {
      generated_at: '2025-06-15T12:00:00Z',
      source: 'github',
      schema_version: '1.0.0',
      categories: [
        { key: 'tooling', label: '工具集成', items: [] },
      ],
    };
    const readme = generateReadme(data);
    expect(readme).not.toContain('## 🔧 工具集成');
    expect(readme).not.toContain('暂无仓库');
  });

  it('should format stars with locale string', () => {
    const data: NavigationData = {
      generated_at: '2025-06-15T12:00:00Z',
      source: 'github',
      schema_version: '1.0.0',
      categories: [
        {
          key: 'other',
          label: '其他',
          items: [mockNavItem({ name: 'star-repo', stars: 12345 })],
        },
      ],
    };
    const readme = generateReadme(data);
    expect(readme).toContain('⭐ 12,345');
  });

  it('should contain category breakdown table', () => {
    const readme = generateReadme(makeReadmeData());
    expect(readme).toContain('### Category Breakdown');
    expect(readme).toContain('| Category | Count | Top Repo |');
  });

  it('should contain footer about section', () => {
    const readme = generateReadme(makeReadmeData());
    expect(readme).toContain('## 📝 About');
    expect(readme).toContain('Claude Code Navigation');
  });
});
