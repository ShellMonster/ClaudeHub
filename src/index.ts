/**
 * 主流水线入口 — Claude Code Navigation 数据扫描与生成
 *
 * 流程：
 * 1. 解析 CLI 参数（--incremental）
 * 2. 增量模式：加载已有数据
 * 3. 搜索 GitHub 仓库
 * 4. 去重
 * 5. AI 分析每个仓库
 * 6. 转换为 NavItem[] 并按分类组织
 * 7. 增量模式：合并已有数据
 * 8. 输出 JSON 和 README
 * 9. 打印统计摘要
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { SEARCH_QUERIES } from './queries.js';
import { searchRepos } from './search.js';
import { deduplicate } from './dedup.js';
import { analyzeRepo } from './ai-analyzer.js';
import { generateJson, stringifyJson } from './output-json.js';
import { generateReadme } from './output-readme.js';
import { mergeResults, parseNavigationData } from './update.js';
import type { GitHubRepo, NavItem, CategorySection, CategoryKey, AIAnalysisResult } from './types.js';
import { CATEGORY_LABELS } from './types.js';

// ─── 常量 ────────────────────────────────────────────────────────────

/** 输出文件路径 */
const DATA_DIR = resolve(import.meta.dirname, '..', 'data');
const JSON_PATH = resolve(DATA_DIR, 'claude-code-nav.json');
const README_PATH = resolve(DATA_DIR, '..', 'README.md');

// ─── CLI 参数解析 ─────────────────────────────────────────────────────

/** 解析命令行参数 */
function parseArgs(): { incremental: boolean } {
  const args = process.argv.slice(2);
  return {
    incremental: args.includes('--incremental'),
  };
}

// ─── 数据加载 ─────────────────────────────────────────────────────────

/** 增量模式：从磁盘加载已有数据 */
async function loadExistingData(): Promise<string | null> {
  try {
    return await readFile(JSON_PATH, 'utf-8');
  } catch {
    console.warn('[pipeline] 未找到已有数据文件，将执行全量扫描');
    return null;
  }
}

// ─── 仓库搜索 ─────────────────────────────────────────────────────────

/** 执行所有搜索查询，收集并展平结果 */
async function fetchAllRepos(): Promise<GitHubRepo[]> {
  console.info(`[pipeline] 开始搜索，共 ${SEARCH_QUERIES.length} 个查询...`);

  const allResults: GitHubRepo[] = [];

  for (const query of SEARCH_QUERIES) {
    try {
      const repos = await searchRepos(query);
      allResults.push(...repos);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[pipeline] 搜索失败 "${query.query}": ${msg}`);
    }
  }

  console.info(`[pipeline] 搜索完成，共获取 ${allResults.length} 个原始仓库`);
  return allResults;
}

// ─── AI 分析 ──────────────────────────────────────────────────────────

/** 对每个仓库执行 AI 分析 */
async function analyzeAllRepos(repos: GitHubRepo[]): Promise<{ repo: GitHubRepo; analysis: AIAnalysisResult }[]> {
  console.info(`[pipeline] 开始分析 ${repos.length} 个仓库...`);

  const results: { repo: GitHubRepo; analysis: AIAnalysisResult }[] = [];

  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i];
    try {
      const analysis = await analyzeRepo(repo);
      results.push({ repo, analysis });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[pipeline] 分析失败 ${repo.full_name}: ${msg}`);
    }

    // 进度日志（每 50 个输出一次）
    if ((i + 1) % 50 === 0) {
      console.info(`[pipeline] 分析进度: ${i + 1}/${repos.length}`);
    }
  }

  console.info(`[pipeline] 分析完成，成功 ${results.length}/${repos.length}`);
  return results;
}

// ─── 数据转换 ─────────────────────────────────────────────────────────

/** 将 GitHubRepo + AIAnalysisResult 转换为 NavItem */
function toNavItem(repo: GitHubRepo, analysis: AIAnalysisResult): NavItem {
  return {
    id: repo.full_name.replace('/', '_'),
    name: repo.name,
    owner: repo.owner.login,
    url: repo.html_url,
    description: repo.description ?? '',
    summary: analysis.summary,
    tags: analysis.tags,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    updated_at: repo.updated_at,
    content_type: analysis.category,
    score: analysis.score,
    new: true,
    mirror_risk: analysis.mirror_risk,
    original_analysis_likelihood: analysis.original_analysis_likelihood,
  };
}

/** 将 NavItem[] 按分类组织为 CategorySection[] */
function organizeByCategory(items: NavItem[]): CategorySection[] {
  const categoryMap = new Map<CategoryKey, NavItem[]>();

  // 初始化所有分类（保持顺序）
  for (const key of Object.keys(CATEGORY_LABELS) as CategoryKey[]) {
    categoryMap.set(key, []);
  }

  // 分配每个 item 到对应分类
  for (const item of items) {
    const categoryKey = item.content_type as CategoryKey;
    const list = categoryMap.get(categoryKey) ?? categoryMap.get('other')!;
    list.push(item);
  }

  // 转换为 CategorySection[]（过滤掉空分类）
  const sections: CategorySection[] = [];
  for (const [key, items] of categoryMap) {
    if (items.length > 0) {
      sections.push({
        key,
        label: CATEGORY_LABELS[key],
        items,
      });
    }
  }

  return sections;
}

// ─── 文件输出 ─────────────────────────────────────────────────────────

/** 确保输出目录存在 */
async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

/** 写入 JSON 和 README 文件 */
async function writeOutput(navData: ReturnType<typeof generateJson>): Promise<void> {
  await ensureDataDir();

  // 写入 JSON
  const jsonStr = stringifyJson(navData);
  await writeFile(JSON_PATH, jsonStr, 'utf-8');
  console.info(`[pipeline] JSON 已写入: ${JSON_PATH}`);

  // 写入 README
  const readme = generateReadme(navData);
  await writeFile(README_PATH, readme, 'utf-8');
  console.info(`[pipeline] README 已写入: ${README_PATH}`);
}

// ─── 统计摘要 ─────────────────────────────────────────────────────────

/** 打印统计信息 */
function printStatistics(navData: ReturnType<typeof generateJson>): void {
  const totalRepos = navData.categories.reduce((sum, cat) => sum + cat.items.length, 0);
  const newRepos = navData.categories.reduce(
    (sum, cat) => sum + cat.items.filter((item) => item.new).length,
    0,
  );
  const unavailableRepos = navData.categories.reduce(
    (sum, cat) => sum + cat.items.filter((item) => item.unavailable).length,
    0,
  );

  console.info('\n═══════════════════════════════════════');
  console.info('  Claude Code Navigation — 扫描统计');
  console.info('═══════════════════════════════════════');
  console.info(`  总仓库数:     ${totalRepos}`);
  console.info(`  新增仓库:     ${newRepos}`);
  console.info(`  不可访问:     ${unavailableRepos}`);
  console.info(`  分类数:       ${navData.categories.length}`);
  console.info(`  生成时间:     ${navData.generated_at}`);
  console.info('═══════════════════════════════════════\n');

  // 各分类详情
  for (const cat of navData.categories) {
    console.info(`  [${cat.label}] ${cat.items.length} 个仓库`);
  }
}

// ─── 主流程 ───────────────────────────────────────────────────────────

/**
 * 主流水线函数
 *
 * @param options - 配置选项
 * @param options.incremental - 是否增量更新
 */
export async function runPipeline(options: { incremental: boolean } = { incremental: false }): Promise<void> {
  const startTime = Date.now();
  console.info(`[pipeline] 启动 (模式: ${options.incremental ? '增量' : '全量'})`);

  // 1. 增量模式：加载已有数据
  let existingJson: string | null = null;
  if (options.incremental) {
    existingJson = await loadExistingData();
  }

  // 2. 搜索仓库
  const rawRepos = await fetchAllRepos();

  // 3. 去重
  const uniqueRepos = deduplicate(rawRepos);
  console.info(`[pipeline] 去重后: ${uniqueRepos.length} 个仓库 (原始: ${rawRepos.length})`);

  // 4. AI 分析
  const analyzed = await analyzeAllRepos(uniqueRepos);

  // 5. 转换为 NavItem[]
  const navItems: NavItem[] = analyzed.map(({ repo, analysis }) =>
    toNavItem(repo, analysis),
  );

  // 6. 按分类组织
  let categories = organizeByCategory(navItems);

  // 7. 增量模式：合并已有数据
  if (options.incremental && existingJson) {
    const parsed = parseNavigationData(existingJson);
    if (parsed) {
      const merged = mergeResults(parsed, navItems);
      categories = merged.categories;
      console.info('[pipeline] 已与已有数据合并');
    } else {
      console.warn('[pipeline] 已有数据解析失败，使用全新数据');
    }
  }

  // 8. 生成输出
  const navData = generateJson(categories);

  // 9. 写入文件
  await writeOutput(navData);

  // 10. 打印统计
  printStatistics(navData);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.info(`[pipeline] 完成，耗时 ${elapsed}s`);
}

// ─── 脚本入口 ─────────────────────────────────────────────────────────

// 直接运行时执行流水线
runPipeline(parseArgs()).catch((error) => {
  console.error('[pipeline] 致命错误:', error);
  process.exit(1);
});
