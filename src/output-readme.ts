import type { NavigationData, NavItem, CategoryKey } from './types.js';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 子分类结构 */
export interface SubCategory {
  /** 子分类标题，如 "🔥 热门 Skills (⭐1K+)" */
  title: string;
  /** 该子分类下的仓库列表 */
  items: NavItem[];
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

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

// 不需要子分类的分类（项目太少，直接平铺）
const FLAT_CATEGORIES: CategoryKey[] = [
  'awesome_list',
  'book_or_longform',
  'reimplementation',
  'discussion_archive',
  'other',
];

// ─── 工具函数 ────────────────────────────────────────────────────────────────

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

/**
 * 格式化 Star 数为紧凑表示
 * - >= 10000: ⭐12.3K（保留一位小数）
 * - >= 1000: ⭐1.2K（保留一位小数）
 * - < 1000: ⭐123（精确数字）
 */
export function formatStars(count: number): string {
  if (count >= 10000) {
    const k = count / 1000;
    return `⭐${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  if (count >= 1000) {
    const k = count / 1000;
    return `⭐${k.toFixed(1)}K`;
  }
  return `⭐${count}`;
}

/** 生成 GitHub 兼容的锚点链接（小写、空格→连字符、移除 emoji） */
function generateAnchor(text: string): string {
  return text
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '') // 移除 emoji
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-') // 空格→连字符
    .replace(/[^\w\u4e00-\u9fff-]/g, ''); // 保留字母数字中文和连字符
}

// ─── 子分类逻辑 ──────────────────────────────────────────────────────────────

/** 判断字符串是否包含关键词（不区分大小写） */
function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/** 判断 NavItem 的 tags 或 name/description 是否包含关键词 */
function itemMatchesKeywords(
  item: NavItem,
  tagKeywords: string[],
  nameKeywords: string[],
): boolean {
  const tagStr = item.tags.join(' ').toLowerCase();
  const nameLower = item.name.toLowerCase();
  const descLower = (item.description || '').toLowerCase();

  const tagMatch = tagKeywords.some(
    (kw) => tagStr.includes(kw.toLowerCase()),
  );
  const nameMatch = nameKeywords.some(
    (kw) => nameLower.includes(kw.toLowerCase()) || descLower.includes(kw.toLowerCase()),
  );
  return tagMatch || nameMatch;
}

/**
 * 将分类下的仓库分配到子分类
 * 按照任务规格中定义的子分类策略进行分组
 */
export function assignSubCategories(
  key: CategoryKey,
  items: NavItem[],
): SubCategory[] {
  if (items.length === 0) return [];

  // 不需要子分类的分类，直接返回一个默认子分类
  if (FLAT_CATEGORIES.includes(key)) {
    return [{ title: '', items: sortItems(items) }];
  }

  switch (key) {
    case 'source_analysis':
      return assignSourceAnalysis(items);
    case 'reverse_engineering':
      return assignReverseEngineering(items);
    case 'tutorial':
      return assignTutorial(items);
    case 'skill_plugin':
      return assignSkillPlugin(items);
    case 'tooling':
      return assignTooling(items);
    case 'security':
      return assignSecurity(items);
    default:
      return [{ title: '', items: sortItems(items) }];
  }
}

/** 按 stars 降序排序 */
function sortItems(items: NavItem[]): NavItem[] {
  return [...items].sort((a, b) => b.stars - a.stars);
}

/** source_analysis 子分类策略 */
function assignSourceAnalysis(items: NavItem[]): SubCategory[] {
  const used = new Set<string>();
  const subs: SubCategory[] = [];

  // 架构分析
  const architecture = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      text.includes('architecture') ||
      text.includes('internals') ||
      text.includes('pattern') ||
      text.includes('架构') ||
      text.includes('设计')
    );
  });
  if (architecture.length > 0) {
    architecture.forEach((i) => used.add(i.id));
    subs.push({ title: '架构分析', items: sortItems(architecture) });
  }

  // 源码泄露研究
  const leak = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      text.includes('leak') ||
      text.includes('source map') ||
      text.includes('decompile') ||
      text.includes('泄露') ||
      text.includes('泄漏') ||
      text.includes('sourcemap') ||
      text.includes('leaked')
    );
  });
  if (leak.length > 0) {
    leak.forEach((i) => used.add(i.id));
    subs.push({ title: '源码泄露研究', items: sortItems(leak) });
  }

  // 数据分析工具
  const data = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      text.includes('data') ||
      text.includes('analysis') ||
      text.includes('analytics') ||
      text.includes('数据') ||
      text.includes('分析')
    ) && !used.has(item.id);
  });
  if (data.length > 0) {
    data.forEach((i) => used.add(i.id));
    subs.push({ title: '数据分析工具', items: sortItems(data) });
  }

  // 其他源码分析
  const rest = items.filter((i) => !used.has(i.id));
  if (rest.length > 0) {
    subs.push({ title: '其他源码分析', items: sortItems(rest) });
  }

  return subs;
}

/** reverse_engineering 子分类策略 */
function assignReverseEngineering(items: NavItem[]): SubCategory[] {
  const used = new Set<string>();
  const subs: SubCategory[] = [];

  // 逆向工具
  const tools = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      text.includes('tool') ||
      text.includes('skill') ||
      text.includes('mcp') ||
      text.includes('ghidra') ||
      text.includes('ida') ||
      text.includes('工具')
    );
  });
  if (tools.length > 0) {
    tools.forEach((i) => used.add(i.id));
    subs.push({ title: '逆向工具', items: sortItems(tools) });
  }

  // 逆向研究
  const research = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      (text.includes('research') ||
        text.includes('documentation') ||
        text.includes('研究') ||
        text.includes('文档')) &&
      !used.has(item.id)
    );
  });
  if (research.length > 0) {
    research.forEach((i) => used.add(i.id));
    subs.push({ title: '逆向研究', items: sortItems(research) });
  }

  // 其他逆向
  const rest = items.filter((i) => !used.has(i.id));
  if (rest.length > 0) {
    subs.push({ title: '其他逆向', items: sortItems(rest) });
  }

  return subs;
}

/** tutorial 子分类策略 */
function assignTutorial(items: NavItem[]): SubCategory[] {
  const used = new Set<string>();
  const subs: SubCategory[] = [];

  // 入门教程
  const beginner = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      text.includes('beginner') ||
      text.includes('getting started') ||
      text.includes('install') ||
      text.includes('setup') ||
      text.includes('101') ||
      text.includes('入门') ||
      text.includes('安装') ||
      text.includes('starter') ||
      text.includes('零基础') ||
      text.includes('从零')
    );
  });
  if (beginner.length > 0) {
    beginner.forEach((i) => used.add(i.id));
    subs.push({ title: '入门教程', items: sortItems(beginner) });
  }

  // 进阶指南
  const advanced = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      (text.includes('advanced') ||
        text.includes('best practices') ||
        text.includes('workflow') ||
        text.includes('mastery') ||
        text.includes('进阶') ||
        text.includes('高级') ||
        text.includes('最佳实践') ||
        text.includes('ultimate') ||
        text.includes('comprehensive')) &&
      !used.has(item.id)
    );
  });
  if (advanced.length > 0) {
    advanced.forEach((i) => used.add(i.id));
    subs.push({ title: '进阶指南', items: sortItems(advanced) });
  }

  // 学习框架
  const framework = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      (text.includes('framework') ||
        text.includes('system') ||
        text.includes('memory') ||
        text.includes('learning') ||
        text.includes('学习') ||
        text.includes('记忆') ||
        text.includes('课程')) &&
      !used.has(item.id)
    );
  });
  if (framework.length > 0) {
    framework.forEach((i) => used.add(i.id));
    subs.push({ title: '学习框架', items: sortItems(framework) });
  }

  // 其他教程
  const rest = items.filter((i) => !used.has(i.id));
  if (rest.length > 0) {
    subs.push({ title: '其他教程', items: sortItems(rest) });
  }

  return subs;
}

/** skill_plugin 子分类策略（最大的分类，416 项） */
function assignSkillPlugin(items: NavItem[]): SubCategory[] {
  const used = new Set<string>();
  const subs: SubCategory[] = [];

  // 🔥 热门 Skills (⭐1K+)
  const hot = items.filter((item) => item.stars >= 1000);
  if (hot.length > 0) {
    hot.forEach((i) => used.add(i.id));
    subs.push({ title: '🔥 热门 Skills (⭐1K+)', items: sortItems(hot) });
  }

  // MCP 服务器
  const mcp = items.filter((item) => {
    return (
      !used.has(item.id) &&
      itemMatchesKeywords(item, ['mcp'], ['mcp'])
    );
  });
  if (mcp.length > 0) {
    mcp.forEach((i) => used.add(i.id));
    subs.push({ title: 'MCP 服务器', items: sortItems(mcp) });
  }

  // 插件与市场
  const plugin = items.filter((item) => {
    return (
      !used.has(item.id) &&
      itemMatchesKeywords(
        item,
        ['plugin', 'marketplace'],
        ['plugin', 'market'],
      )
    );
  });
  if (plugin.length > 0) {
    plugin.forEach((i) => used.add(i.id));
    subs.push({ title: '插件与市场', items: sortItems(plugin) });
  }

  // 安全与审计
  const security = items.filter((item) => {
    return (
      !used.has(item.id) &&
      itemMatchesKeywords(
        item,
        ['security', 'audit'],
        ['security'],
      )
    );
  });
  if (security.length > 0) {
    security.forEach((i) => used.add(i.id));
    subs.push({ title: '安全与审计', items: sortItems(security) });
  }

  // 开发工作流
  const workflow = items.filter((item) => {
    return (
      !used.has(item.id) &&
      itemMatchesKeywords(
        item,
        ['workflow', 'dev', 'agent'],
        ['workflow', 'agent'],
      )
    );
  });
  if (workflow.length > 0) {
    workflow.forEach((i) => used.add(i.id));
    subs.push({ title: '开发工作流', items: sortItems(workflow) });
  }

  // 其他 Skills
  const rest = items.filter((i) => !used.has(i.id));
  if (rest.length > 0) {
    subs.push({ title: '其他 Skills', items: sortItems(rest) });
  }

  return subs;
}

/** tooling 子分类策略 */
function assignTooling(items: NavItem[]): SubCategory[] {
  const used = new Set<string>();
  const subs: SubCategory[] = [];

  // CLI 与终端
  const cli = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      text.includes('cli') ||
      text.includes('terminal') ||
      text.includes('statusline') ||
      text.includes('命令行')
    );
  });
  if (cli.length > 0) {
    cli.forEach((i) => used.add(i.id));
    subs.push({ title: 'CLI 与终端', items: sortItems(cli) });
  }

  // IDE 集成
  const ide = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      (text.includes('ide') ||
        text.includes('vscode') ||
        text.includes('nvim') ||
        text.includes('editor') ||
        text.includes('jetbrains') ||
        text.includes('emacs')) &&
      !used.has(item.id)
    );
  });
  if (ide.length > 0) {
    ide.forEach((i) => used.add(i.id));
    subs.push({ title: 'IDE 集成', items: sortItems(ide) });
  }

  // 代理与路由
  const proxy = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      (text.includes('proxy') ||
        text.includes('router') ||
        text.includes('relay') ||
        text.includes('gateway') ||
        text.includes('中转') ||
        text.includes('路由')) &&
      !used.has(item.id)
    );
  });
  if (proxy.length > 0) {
    proxy.forEach((i) => used.add(i.id));
    subs.push({ title: '代理与路由', items: sortItems(proxy) });
  }

  // 监控与统计
  const monitor = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      (text.includes('monitor') ||
        text.includes('usage') ||
        text.includes('stats') ||
        text.includes('dashboard') ||
        text.includes('监控') ||
        text.includes('统计')) &&
      !used.has(item.id)
    );
  });
  if (monitor.length > 0) {
    monitor.forEach((i) => used.add(i.id));
    subs.push({ title: '监控与统计', items: sortItems(monitor) });
  }

  // 其他工具
  const rest = items.filter((i) => !used.has(i.id));
  if (rest.length > 0) {
    subs.push({ title: '其他工具', items: sortItems(rest) });
  }

  return subs;
}

/** security 子分类策略 */
function assignSecurity(items: NavItem[]): SubCategory[] {
  const used = new Set<string>();
  const subs: SubCategory[] = [];

  // 安全审计
  const audit = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      text.includes('audit') ||
      text.includes('pentest') ||
      text.includes('vulnerability') ||
      text.includes('审计') ||
      text.includes('渗透')
    );
  });
  if (audit.length > 0) {
    audit.forEach((i) => used.add(i.id));
    subs.push({ title: '安全审计', items: sortItems(audit) });
  }

  // 防护与沙箱
  const sandbox = items.filter((item) => {
    const text = `${item.tags.join(' ')} ${item.name} ${item.description}`.toLowerCase();
    return (
      (text.includes('sandbox') ||
        text.includes('guard') ||
        text.includes('protection') ||
        text.includes('沙箱') ||
        text.includes('防护') ||
        text.includes('firewall') ||
        text.includes('secure')) &&
      !used.has(item.id)
    );
  });
  if (sandbox.length > 0) {
    sandbox.forEach((i) => used.add(i.id));
    subs.push({ title: '防护与沙箱', items: sortItems(sandbox) });
  }

  // 其他安全
  const rest = items.filter((i) => !used.has(i.id));
  if (rest.length > 0) {
    subs.push({ title: '其他安全', items: sortItems(rest) });
  }

  return subs;
}

// ─── README 各区块生成 ───────────────────────────────────────────────────────

/** 生成 Overview 统计表 */
function generateOverviewSection(data: NavigationData): string {
  const totalRepos = countTotalRepos(data);
  const nonEmptyCategories = data.categories.filter(
    (cat) => cat.items.length > 0,
  );
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
  const nonEmptyCategories = data.categories.filter(
    (cat) => cat.items.length > 0,
  );

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
    const topRepo = cat.items.reduce(
      (best, item) => (item.stars > best.stars ? item : best),
      cat.items[0],
    );
    const topRepoLink = `[${topRepo.name}](${topRepo.url}) ${formatStars(topRepo.stars)}`;
    lines.push(`| ${icon} ${cat.label} | ${count} | ${topRepoLink} |`);
  }

  lines.push('');
  return lines.join('\n');
}

/** 生成 TOC（目录）区块 */
function generateTOC(data: NavigationData): string {
  const nonEmptyCategories = data.categories.filter(
    (cat) => cat.items.length > 0,
  );

  const lines: string[] = ['## Contents', ''];

  for (const cat of nonEmptyCategories) {
    const icon = getCategoryIcon(cat.key);
    const heading = `${icon} ${cat.label}`;
    const anchor = generateAnchor(heading);

    // 检查是否有子分类
    const subCats = assignSubCategories(cat.key, cat.items);
    const hasSubCategories = subCats.some((sc) => sc.title !== '');

    if (hasSubCategories) {
      lines.push(`- [${heading}](#${anchor})`);
      for (const sub of subCats) {
        if (sub.title) {
          const subAnchor = generateAnchor(sub.title);
          lines.push(`  - [${sub.title}](#${subAnchor})`);
        }
      }
    } else {
      lines.push(`- [${heading}](#${anchor})`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/** 渲染单个仓库为 bullet list 行 */
function renderBulletItem(item: NavItem): string {
  const archivedPrefix = item.unavailable ? '📦 ' : '';
  const starsFormatted = formatStars(item.stars);
  const fireEmoji = item.stars >= 1000 ? ' 🔥' : '';
  const desc = item.summary || item.description || '';

  return `- ${archivedPrefix}[${item.name}](${item.url}) ${starsFormatted} — ${desc}${fireEmoji}`;
}

/** 生成单个分类的详情区块 */
function generateCategorySection(
  key: CategoryKey,
  label: string,
  items: NavItem[],
): string {
  if (items.length === 0) return ''; // 空分类隐藏

  const icon = getCategoryIcon(key);
  const description = getCategoryDescription(key);
  const date = formatDate(items[0]?.updated_at ?? '');

  const lines: string[] = [`## ${icon} ${label}`, ''];

  // 描述引用块
  if (description) {
    lines.push(`> ${description}`);
    lines.push('');
  }

  // 元数据行
  lines.push(`**${items.length} repositories** · Updated ${date}`);
  lines.push('');

  // 子分类
  const subCategories = assignSubCategories(key, items);

  for (const sub of subCategories) {
    if (sub.title) {
      lines.push(`### ${sub.title}`);
      lines.push('');
    }

    for (const item of sub.items) {
      lines.push(renderBulletItem(item));
    }

    lines.push('');
  }

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
  sections.push(
    '> 🤖 Auto-generated navigation for Claude Code ecosystem resources on GitHub',
  );
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

  // TOC 目录
  sections.push(generateTOC(data));
  sections.push('---');
  sections.push('');

  // 各分类详情（空分类跳过）
  const nonEmptyCategories = data.categories.filter(
    (cat) => cat.items.length > 0,
  );
  nonEmptyCategories.forEach((cat, index) => {
    const section = generateCategorySection(cat.key, cat.label, cat.items);
    if (section) {
      sections.push(section);
      // 分类之间用分隔线隔开（最后一个分类后面不加）
      if (index < nonEmptyCategories.length - 1) {
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
