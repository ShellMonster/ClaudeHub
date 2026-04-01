import { describe, it, expect } from 'vitest';
import { generateJson, stringifyJson } from '../src/output-json.js';
import { generateReadme, formatStars, assignSubCategories } from '../src/output-readme.js';
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

describe('formatStars', () => {
  it('should format stars >= 10000 with one decimal K', () => {
    expect(formatStars(12345)).toBe('⭐12.3K');
    expect(formatStars(10000)).toBe('⭐10K');
  });

  it('should format stars >= 1000 with one decimal K', () => {
    expect(formatStars(1500)).toBe('⭐1.5K');
    expect(formatStars(1000)).toBe('⭐1.0K');
  });

  it('should format stars < 1000 as exact number', () => {
    expect(formatStars(999)).toBe('⭐999');
    expect(formatStars(0)).toBe('⭐0');
    expect(formatStars(42)).toBe('⭐42');
  });
});

describe('assignSubCategories', () => {
  it('should return flat list for categories without sub-categories', () => {
    const items = [mockNavItem({ name: 'a', stars: 10 }), mockNavItem({ name: 'b', stars: 20 })];
    const subs = assignSubCategories('other', items);
    expect(subs).toHaveLength(1);
    expect(subs[0].title).toBe('');
    expect(subs[0].items).toHaveLength(2);
  });

  it('should sort items by stars descending within sub-categories', () => {
    const items = [
      mockNavItem({ name: 'low', stars: 10 }),
      mockNavItem({ name: 'high', stars: 500 }),
    ];
    const subs = assignSubCategories('other', items);
    expect(subs[0].items[0].name).toBe('high');
    expect(subs[0].items[1].name).toBe('low');
  });

  it('should return empty array for empty items', () => {
    const subs = assignSubCategories('source_analysis', []);
    expect(subs).toEqual([]);
  });

  it('should create sub-categories for skill_plugin with hot items', () => {
    const items = [
      mockNavItem({ id: 'hot1', name: 'hot-skill', stars: 5000, tags: ['skill'] }),
      mockNavItem({ id: 'mcp1', name: 'mcp-server', stars: 200, tags: ['mcp'] }),
      mockNavItem({ id: 'reg1', name: 'regular-skill', stars: 50, tags: ['skill'] }),
    ];
    const subs = assignSubCategories('skill_plugin', items);
    expect(subs.length).toBeGreaterThanOrEqual(2);
    expect(subs[0].title).toContain('热门');
    expect(subs[0].items[0].name).toBe('hot-skill');
    const allNames = subs.flatMap((s) => s.items.map((i) => i.name));
    expect(allNames).toContain('mcp-server');
    expect(allNames).toContain('regular-skill');
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

  it('should generate TOC with category links', () => {
    const readme = generateReadme(makeReadmeData());
    expect(readme).toContain('## Contents');
    expect(readme).toContain('[🔬 源码分析]');
    expect(readme).toContain('[📚 教程指南]');
  });

  it('should generate sub-category headings with ###', () => {
    const readme = generateReadme(makeReadmeData());
    const h3Count = (readme.match(/^### /gm) || []).length;
    expect(h3Count).toBeGreaterThanOrEqual(1);
  });

  it('should format items as bullet lists', () => {
    const readme = generateReadme(makeReadmeData());
    expect(readme).toContain('- [repo-a]');
    expect(readme).toContain('- [repo-b]');
    expect(readme).toContain('- [tut-1]');
  });

  it('should not contain table rows with rank and score columns', () => {
    const readme = generateReadme(makeReadmeData());
    expect(readme).not.toContain('| # | Repository | Description | Stars | Score |');
  });

  it('should append 🔥 for repos with 1000+ stars', () => {
    const readme = generateReadme(makeReadmeData());
    const repoALine = readme.split('\n').find((line) => line.startsWith('- ') && line.includes('[repo-a]'));
    expect(repoALine).toBeTruthy();
    expect(repoALine!).toContain('🔥');
  });

  it('should not append 🔥 for repos with < 1000 stars', () => {
    const readme = generateReadme(makeReadmeData());
    const repoBLine = readme.split('\n').find((line) => line.includes('[repo-b]'));
    expect(repoBLine).toBeTruthy();
    expect(repoBLine!).not.toContain('🔥');
  });

  it('should format stars in compact notation', () => {
    const data: NavigationData = {
      generated_at: '2025-06-15T12:00:00Z',
      source: 'github',
      schema_version: '1.0.0',
      categories: [
        {
          key: 'other',
          label: '其他',
          items: [
            mockNavItem({ name: 'big-repo', stars: 12345 }),
            mockNavItem({ name: 'mid-repo', stars: 1500 }),
            mockNavItem({ name: 'small-repo', stars: 42 }),
          ],
        },
      ],
    };
    const readme = generateReadme(data);
    expect(readme).toContain('⭐12.3K');
    expect(readme).toContain('⭐1.5K');
    expect(readme).toContain('⭐42');
  });

  it('should mark archived repos with 📦 in bullet list', () => {
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
    expect(readme).toContain('- 📦 [archived-repo]');
  });

  it('should not truncate descriptions', () => {
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
    expect(readme).toContain(longDesc);
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
