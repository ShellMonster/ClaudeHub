import type { NavigationData, NavItem, CategoryKey } from './types.js';

// ─── 常量 ────────────────────────────────────────────────────────────────────

const MAX_DESCRIPTION_LENGTH = 150;

// 分类图标（emoji）
const CATEGORY_ICONS: Record<string, string> = {
  source_analysis: '🔬',
  reverse_engineering: '🔓',
  tutorial: '📚',
  skill_plugin: '🧩',
  tooling: '🔧',
  security: '🛡️',
  awesome_list: '⭐',
  book_or_longform: '📖',
  reimplementation: '🔨',
  discussion_archive: '💬',
  other: '📦',
};

// 分类描述
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  source_analysis: 'Deep analysis of Claude Code source code, architecture, and internals',
  reverse_engineering: 'Reverse engineering and deobfuscation of Claude Code',
  tutorial: 'Tutorials, guides, courses, and learning resources',
  skill_plugin: 'Claude Code skills, plugins, MCP servers, and slash commands',
  tooling: 'CLI tools, extensions, dashboards, and integrations',
  security: 'Security research, vulnerability analysis, and auditing tools',
  awesome_list: 'Curated collections and resource lists',
  book_or_longform: 'Books, long-form articles, and comprehensive guides',
  reimplementation: 'Reimplementations and from-scratch clones',
  discussion_archive: 'Community discussions, FAQs, and archives',
  other: 'Other Claude Code related projects',
};

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/** 截断描述文本，超出 maxLength 时加省略号 */
function truncateDescription(text: string, maxLength: number = MAX_DESCRIPTION_LENGTH): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/** 将 1-5 整数评分转换为星标 emoji */
function scoreToStars(score: number): string {
  return '⭐'.repeat(Math.min(Math.max(score, 0), 5));
}

/** 获取分类图标，找不到时返回默认图标 */
function getCategoryIcon(key: string): string {
  return CATEGORY_ICONS[key] ?? '📁';
}

/** 获取分类描述，找不到时返回空字符串 */
function getCategoryDescription(key: string): string {
  return CATEGORY_DESCRIPTIONS[key] ?? '';
}

/** 统计仓库总数 */
function countTotalRepos(data: NavigationData): number {
  return data.categories.reduce((sum, cat) => sum + cat.items.length, 0);
}

/** 格式化日期为可读字符串 */
function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  } catch {
    return isoString;
  }
}

// ─── README 各区块生成 ───────────────────────────────────────────────────────

/** 生成 Overview 统计表 */
function generateOverviewSection(data: NavigationData): string {
  const totalRepos = countTotalRepos(data);
  const nonEmptyCategories = data.categories.filter((cat) => cat.items.length > 0);
  const date = formatDate(data.generated_at);

  const lines: string[] = [
    '## 📊 Overview',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Repositories | ${totalRepos.toLocaleString()} |`,
    `| Categories | ${nonEmptyCategories.length} |`,
    `| Last Updated | ${date} |`,
    '| Data Source | GitHub Search API |',
    '',
  ];

  return lines.join('\n');
}

/** 生成 Category Breakdown 表 */
function generateCategoryBreakdown(data: NavigationData): string {
  const nonEmptyCategories = data.categories.filter((cat) => cat.items.length > 0);

  const lines: string[] = [
    '### Category Breakdown',
    '',
    '| Category | Count | Top Repo |',
    '|----------|-------|----------|',
  ];

  for (const cat of nonEmptyCategories) {
    const icon = getCategoryIcon(cat.key);
    const count = cat.items.length;
    // 取 star 最多的仓库作为 Top Repo
    const topRepo = cat.items.reduce((best, item) =>
      item.stars > best.stars ? item : best,
    cat.items[0]);
    const topRepoLink = `[${topRepo.name}](${topRepo.url}) ⭐${topRepo.stars.toLocaleString()}`;
    lines.push(`| ${icon} ${cat.label} | ${count} | ${topRepoLink} |`);
  }

  lines.push('');
  return lines.join('\n');
}

/** 生成单个分类的详情区块 */
function generateCategorySection(key: CategoryKey, label: string, items: NavItem[]): string {
  if (items.length === 0) return ''; // 空分类隐藏

  const icon = getCategoryIcon(key);
  const description = getCategoryDescription(key);
  const date = formatDate(items[0]?.updated_at ?? '');

  const lines: string[] = [
    `## ${icon} ${label}`,
    '',
  ];

  // 描述引用块
  if (description) {
    lines.push(`> ${description}`);
    lines.push('');
  }

  // 元数据行
  lines.push(`**${items.length} repositories** · Updated ${date}`);
  lines.push('');

  // 表格
  lines.push('| # | Repository | Description | Stars | Score |');
  lines.push('|---|-----------|-------------|-------|-------|');

  items.forEach((item, index) => {
    const rank = index + 1;
    const archivedMarker = item.unavailable ? '📦 ' : '';
    const name = `${archivedMarker}[${item.name}](${item.url})`;
    const desc = truncateDescription(item.summary || item.description);
    const stars = `⭐ ${item.stars.toLocaleString()}`;
    const score = scoreToStars(item.score);
    lines.push(`| ${rank} | ${name} | ${desc} | ${stars} | ${score} |`);
  });

  return lines.join('\n');
}

/** 生成页脚 About 区块 */
function generateFooter(data: NavigationData): string {
  const date = formatDate(data.generated_at);

  const lines: string[] = [
    '## 📝 About',
    '',
    'This index is automatically generated by scanning GitHub for repositories related to the **Claude Code** CLI tool by Anthropic.',
    '',
    `*Last scan: ${date} · Generated by [Claude Code Navigation](https://github.com/ShellMonster/ClaudeHub)*`,
  ];

  return lines.join('\n');
}

// ─── 主函数 ──────────────────────────────────────────────────────────────────

/** 将 NavigationData 转换为 Markdown 导航文档 */
export function generateReadme(data: NavigationData): string {
  const sections: string[] = [];

  // 标题
  sections.push('# Claude Code Navigation 🔍');
  sections.push('');
  sections.push('> 🤖 Auto-generated navigation for Claude Code ecosystem resources on GitHub');
  sections.push('');
  sections.push('---');
  sections.push('');

  // Overview 统计
  sections.push(generateOverviewSection(data));
  sections.push('');

  // Category Breakdown
  sections.push(generateCategoryBreakdown(data));
  sections.push('---');
  sections.push('');

  // 各分类详情（空分类跳过）
  const nonEmptyCategories = data.categories.filter((cat) => cat.items.length > 0);
  nonEmptyCategories.forEach((cat, index) => {
    const section = generateCategorySection(cat.key, cat.label, cat.items);
    if (section) {
      sections.push(section);
      // 分类之间用分隔线隔开（最后一个分类后面不加）
      if (index < nonEmptyCategories.length - 1) {
        sections.push('');
        sections.push('---');
        sections.push('');
      }
    }
  });

  // 页脚
  sections.push('');
  sections.push('---');
  sections.push('');
  sections.push(generateFooter(data));

  return sections.join('\n');
}
