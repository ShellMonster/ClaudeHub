/**
 * Claude Code Navigation - Main Application
 */
(function () {
  'use strict';

  // ==================== Global State ====================
  window.navData = null;
  let currentFilter = {
    category: 'all',
    search: '',
    tags: [],
    sort: 'stars'
  };
  let dom = {};
  let searchDebounceTimer = null;
  let renderedCards = new Map();
  const LARGE_CATEGORY_THRESHOLD = 200;
  const largeCategories = new Map();

  // ==================== Utility Functions ====================

  function formatStars(stars) {
    if (stars >= 10000) {
      return (stars / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    if (stars >= 1000) {
      return (stars / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return stars.toString();
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  }

  function isWithinLast7Days(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = (now - date) / (1000 * 60 * 60 * 24);
    return diffDays <= 7;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function highlightText(text, searchTerm) {
    if (!searchTerm || !text) return escapeHtml(text);
    const escapedSearch = escapeHtml(searchTerm).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(' + escapedSearch + ')', 'gi');
    return escapeHtml(text).replace(regex, '<mark>$1</mark>');
  }

  function debounce(func, wait) {
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(searchDebounceTimer);
        func(...args);
      };
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(later, wait);
    };
  }

  function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      q: params.get('q') || '',
      cat: params.get('cat') || 'all',
      sort: params.get('sort') || 'stars',
      tags: params.get('tags') ? params.get('tags').split(',') : []
    };
  }

  function updateUrl() {
    const params = new URLSearchParams();
    if (currentFilter.search) params.set('q', currentFilter.search);
    if (currentFilter.category !== 'all') params.set('cat', currentFilter.category);
    if (currentFilter.sort !== 'stars') params.set('sort', currentFilter.sort);
    if (currentFilter.tags.length > 0) params.set('tags', currentFilter.tags.join(','));

    const newUrl = params.toString()
      ? '?' + params.toString()
      : window.location.pathname;
    history.replaceState(currentFilter, '', newUrl);
  }

  // ==================== Counter Animation ====================

  function animateCounter(element, target, duration = 800) {
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (target - start) * easeOut);

      element.textContent = current.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = target.toLocaleString();
      }
    }

    requestAnimationFrame(update);
  }

  // ==================== DOM Cache ====================

  function cacheDom() {
    dom = {
      sidebar: document.getElementById('sidebar'),
      sidebarClose: document.getElementById('sidebar-close'),
      sidebarToggle: document.getElementById('sidebar-toggle'),
      sidebarOverlay: document.getElementById('sidebar-overlay'),
      stats: document.getElementById('stats'),
      categoryNav: document.getElementById('category-nav'),
      lastUpdated: document.getElementById('last-updated'),
      searchInput: document.getElementById('search-input'),
      sortSelect: document.getElementById('sort-select'),
      darkToggle: document.getElementById('dark-toggle'),
      filterBar: document.getElementById('filter-bar'),
      content: document.getElementById('content'),
      loading: document.getElementById('loading'),
      emptyState: document.getElementById('empty-state'),
      backToTop: document.getElementById('back-to-top')
    };
  }

  // ==================== Data Loading ====================

  async function loadData() {
    try {
      showLoading(true);
      const response = await fetch('./data/claude-code-nav.json');
      if (!response.ok) {
        throw new Error('Failed to load data: ' + response.status);
      }
      window.navData = await response.json();
      showLoading(false);
      initApp();
    } catch (error) {
      showLoading(false);
      showError('加载数据失败，请刷新页面重试。<br><small>' + escapeHtml(error.message) + '</small>');
    }
  }

  function showLoading(show) {
    if (dom.loading) {
      dom.loading.style.display = show ? 'flex' : 'none';
    }
  }

  function showError(message) {
    if (dom.content) {
      dom.content.innerHTML = '<div class="error-state"><strong>出错了</strong>' + message + '</div>';
    }
  }

  // ==================== Rendering ====================

  function renderSidebarStats() {
    if (!dom.stats || !window.navData) return;

    const totalRepos = window.navData.categories.reduce((sum, cat) => sum + cat.items.length, 0);
    const totalCategories = window.navData.categories.length;

    dom.stats.innerHTML = `
      <div class="stat-item">
        <span class="stat-number" data-target="${totalRepos}">0</span>
        <span class="stat-label">项目</span>
      </div>
      <div class="stat-item">
        <span class="stat-number" data-target="${totalCategories}">0</span>
        <span class="stat-label">分类</span>
      </div>
    `;

    dom.stats.querySelectorAll('.stat-number').forEach(el => {
      animateCounter(el, parseInt(el.dataset.target));
    });
  }

  function renderSidebarCategories() {
    if (!dom.categoryNav || !window.navData) return;

    const fragment = document.createDocumentFragment();

    const allItem = createNavItem('all', '全部项目',
      window.navData.categories.reduce((sum, cat) => sum + cat.items.length, 0), '');
    fragment.appendChild(allItem);

    window.navData.categories.forEach(cat => {
      const item = createNavItem(cat.key, cat.label, cat.items.length,
        `var(--cat-${cat.key})`);
      fragment.appendChild(item);
    });

    dom.categoryNav.innerHTML = '';
    dom.categoryNav.appendChild(fragment);
  }

  function createNavItem(key, label, count, color) {
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'nav-item' + (key === currentFilter.category ? ' active' : '');
    a.dataset.category = key;

    const dot = color ? `<span class="nav-dot" style="background: ${color};"></span>` : '';
    a.innerHTML = `${dot}<span class="nav-label">${escapeHtml(label)}</span><span class="nav-count">${count.toLocaleString()}</span>`;

    return a;
  }

  function renderLastUpdated() {
    if (!dom.lastUpdated || !window.navData) return;
    const date = formatDate(window.navData.generated_at);
    dom.lastUpdated.textContent = '更新于 ' + date;
  }

  function renderContent() {
    if (!dom.content || !window.navData) return;

    const fragment = document.createDocumentFragment();
    renderedCards.clear();
    largeCategories.clear();

    const categories = currentFilter.category === 'all'
      ? window.navData.categories
      : window.navData.categories.filter(cat => cat.key === currentFilter.category);

    categories.forEach((category, index) => {
      const section = renderCategorySection(category, index);
      if (section) {
        fragment.appendChild(section);
      }
    });

    dom.content.innerHTML = '';
    dom.content.appendChild(fragment);

    updateEmptyState();
  }

  function renderCategorySection(category, sectionIndex) {
    let items = filterItems(category.items);
    items = sortItems(items);

    if (items.length === 0 && currentFilter.category !== 'all') {
      return null;
    }

    const section = document.createElement('section');
    section.className = 'category-section';
    section.id = 'cat-' + category.key;
    section.style.animationDelay = (sectionIndex * 50) + 'ms';

    const title = document.createElement('h2');
    title.className = 'category-title';
    title.innerHTML = `
      <span class="cat-dot" style="background: var(--cat-${category.key});"></span>
      ${escapeHtml(category.label)}
      <span class="cat-count">${items.length.toLocaleString()} 个项目</span>
    `;
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'card-grid';

    const isLargeCategory = items.length > LARGE_CATEGORY_THRESHOLD;
    const renderCount = isLargeCategory && currentFilter.category === 'all' &&
      !currentFilter.search && currentFilter.tags.length === 0
      ? LARGE_CATEGORY_THRESHOLD
      : items.length;

    for (let i = 0; i < renderCount; i++) {
      const card = createCard(items[i], category.key);
      card.style.animationDelay = (i * 30) + 'ms';
      grid.appendChild(card);
    }

    section.appendChild(grid);

    if (isLargeCategory && renderCount < items.length) {
      const showMoreBtn = document.createElement('button');
      showMoreBtn.className = 'show-more-btn';
      showMoreBtn.innerHTML = `显示全部 ${items.length.toLocaleString()} 个项目`;
      showMoreBtn.dataset.category = category.key;
      showMoreBtn.dataset.rendered = renderCount;
      showMoreBtn.addEventListener('click', () => showMoreCards(category, items, grid, showMoreBtn));
      section.appendChild(showMoreBtn);
      largeCategories.set(category.key, { items, grid, button: showMoreBtn });
    }

    return section;
  }

  function showMoreCards(category, items, grid, button) {
    const startIdx = parseInt(button.dataset.rendered);
    const fragment = document.createDocumentFragment();

    for (let i = startIdx; i < items.length; i++) {
      const card = createCard(items[i], category.key);
      fragment.appendChild(card);
    }

    grid.appendChild(fragment);
    button.remove();
    largeCategories.delete(category.key);
  }

  function filterItems(items) {
    return items.filter(item => {
      if (currentFilter.tags.length > 0) {
        const itemTags = item.tags || [];
        const hasAllTags = currentFilter.tags.every(tag => itemTags.includes(tag));
        if (!hasAllTags) return false;
      }

      if (currentFilter.search) {
        const searchLower = currentFilter.search.toLowerCase();
        const searchable = [
          item.name,
          item.description,
          item.summary,
          item.owner,
          ...(item.tags || [])
        ].filter(Boolean).join(' ').toLowerCase();

        if (!searchable.includes(searchLower)) return false;
      }

      return true;
    });
  }

  function sortItems(items) {
    const sorted = [...items];

    switch (currentFilter.sort) {
      case 'stars':
        sorted.sort((a, b) => b.stars - a.stars);
        break;
      case 'updated':
        sorted.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        break;
      case 'score':
        sorted.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return b.stars - a.stars;
        });
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return sorted;
  }

  function createCard(item, categoryKey) {
    const card = document.createElement('a');
    card.href = item.url;
    card.target = '_blank';
    card.rel = 'noopener';
    card.className = 'card';
    card.dataset.category = categoryKey;
    card.dataset.stars = item.stars;
    card.dataset.tags = (item.tags || []).join(',');

    if (item.stars >= 1000) card.classList.add('hot');
    if (isWithinLast7Days(item.updated_at)) card.classList.add('new');
    if (item.unavailable) card.classList.add('unavailable');

    const displayName = currentFilter.search
      ? highlightText(item.name, currentFilter.search)
      : escapeHtml(item.name);

    const displayDesc = currentFilter.search
      ? highlightText(item.summary || item.description, currentFilter.search)
      : escapeHtml(item.summary || item.description || '');

    const newBadge = isWithinLast7Days(item.updated_at)
      ? '<span class="card-badge-new">NEW</span>'
      : '';

    const tagsHtml = (item.tags || []).slice(0, 4).map(tag => {
      const tagClass = currentFilter.tags.includes(tag) ? 'card-tag active' : 'card-tag';
      return `<span class="${tagClass}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`;
    }).join('');

    card.innerHTML = `
      <div class="card-header">
        <span class="card-name">${displayName}${newBadge}</span>
        <span class="card-stars">${formatStars(item.stars)}</span>
      </div>
      <p class="card-desc">${displayDesc}</p>
      <div class="card-footer">
        <div class="card-tags">${tagsHtml}</div>
        <span class="card-meta">${escapeHtml(item.owner)} · ${formatDate(item.updated_at)}</span>
      </div>
    `;

    renderedCards.set(item.id, card);
    return card;
  }

  function updateEmptyState() {
    if (!dom.emptyState) return;

    const visibleCards = document.querySelectorAll('.card');
    if (visibleCards.length === 0) {
      dom.emptyState.style.display = 'flex';
      dom.content.style.display = 'none';
    } else {
      dom.emptyState.style.display = 'none';
      dom.content.style.display = 'block';
    }
  }

  function renderFilterBar() {
    if (!dom.filterBar) return;

    if (currentFilter.tags.length === 0) {
      dom.filterBar.innerHTML = '';
      dom.filterBar.style.display = 'none';
      return;
    }

    const fragment = document.createDocumentFragment();

    currentFilter.tags.forEach(tag => {
      const filterTag = document.createElement('span');
      filterTag.className = 'filter-tag';
      filterTag.innerHTML = `${escapeHtml(tag)} <button class="filter-remove" data-tag="${escapeHtml(tag)}">×</button>`;
      fragment.appendChild(filterTag);
    });

    const clearAll = document.createElement('button');
    clearAll.className = 'filter-clear';
    clearAll.textContent = '清除全部';
    clearAll.addEventListener('click', clearAllTags);
    fragment.appendChild(clearAll);

    dom.filterBar.innerHTML = '';
    dom.filterBar.appendChild(fragment);
    dom.filterBar.style.display = 'flex';
  }

  function updateSidebarActiveState() {
    if (!dom.categoryNav) return;

    const items = dom.categoryNav.querySelectorAll('.nav-item');
    items.forEach(item => {
      item.classList.toggle('active', item.dataset.category === currentFilter.category);
    });
  }

  // ==================== Event Handlers ====================

  function handleSearch(value) {
    currentFilter.search = value.trim();
    updateUrl();
    renderContent();
  }

  function handleSortChange(sortValue) {
    currentFilter.sort = sortValue;
    updateUrl();
    renderContent();
  }

  function handleCategoryClick(category) {
    currentFilter.category = category;
    updateUrl();
    updateSidebarActiveState();
    renderContent();

    if (category !== 'all') {
      const section = document.getElementById('cat-' + category);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    closeSidebar();
  }

  function handleTagClick(tag) {
    if (!currentFilter.tags.includes(tag)) {
      currentFilter.tags.push(tag);
      updateUrl();
      renderFilterBar();
      renderContent();
    }
  }

  function handleTagRemove(tag) {
    currentFilter.tags = currentFilter.tags.filter(t => t !== tag);
    updateUrl();
    renderFilterBar();
    renderContent();
  }

  function clearAllTags() {
    currentFilter.tags = [];
    updateUrl();
    renderFilterBar();
    renderContent();
  }

  // ==================== Sidebar (Mobile) ====================

  function openSidebar() {
    dom.sidebar.classList.add('open');
    dom.sidebarOverlay.classList.add('visible');
    document.body.classList.add('sidebar-open');
  }

  function closeSidebar() {
    dom.sidebar.classList.remove('open');
    dom.sidebarOverlay.classList.remove('visible');
    document.body.classList.remove('sidebar-open');
  }

  // ==================== Dark Mode ====================

  function initDarkMode() {
    const saved = localStorage.getItem('dark-mode');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved !== null ? saved === 'true' : prefersDark;

    document.documentElement.classList.toggle('dark', isDark);
    updateDarkModeIcon();
  }

  function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('dark-mode', isDark);
    updateDarkModeIcon();
  }

  function updateDarkModeIcon() {
    if (!dom.darkToggle) return;
    const isDark = document.documentElement.classList.contains('dark');
    dom.darkToggle.textContent = isDark ? '☀️' : '🌙';
  }

  // ==================== Back to Top ====================

  function initBackToTop() {
    if (!dom.backToTop) return;

    const toggleVisibility = () => {
      dom.backToTop.classList.toggle('visible', window.scrollY > 500);
    };

    window.addEventListener('scroll', toggleVisibility, { passive: true });

    dom.backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ==================== Event Delegation ====================

  function initEventDelegation() {
    if (dom.categoryNav) {
      dom.categoryNav.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem) {
          e.preventDefault();
          handleCategoryClick(navItem.dataset.category);
        }
      });
    }

    if (dom.content) {
      dom.content.addEventListener('click', (e) => {
        const tag = e.target.closest('.card-tag');
        if (tag && tag.dataset.tag) {
          e.preventDefault();
          handleTagClick(tag.dataset.tag);
        }
      });
    }

    if (dom.filterBar) {
      dom.filterBar.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.filter-remove');
        if (removeBtn && removeBtn.dataset.tag) {
          e.preventDefault();
          handleTagRemove(removeBtn.dataset.tag);
        }
      });
    }

    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', debounce((e) => {
        handleSearch(e.target.value);
      }, 300));

      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== dom.searchInput) {
          e.preventDefault();
          dom.searchInput.focus();
        }
        if (e.key === 'Escape' && document.activeElement === dom.searchInput) {
          dom.searchInput.value = '';
          dom.searchInput.blur();
          handleSearch('');
        }
        if (e.key === 'Escape') {
          closeSidebar();
        }
      });
    }

    if (dom.sortSelect) {
      dom.sortSelect.addEventListener('change', (e) => {
        handleSortChange(e.target.value);
      });
    }

    if (dom.darkToggle) {
      dom.darkToggle.addEventListener('click', toggleDarkMode);
    }

    if (dom.sidebarToggle) {
      dom.sidebarToggle.addEventListener('click', openSidebar);
    }

    if (dom.sidebarClose) {
      dom.sidebarClose.addEventListener('click', closeSidebar);
    }

    if (dom.sidebarOverlay) {
      dom.sidebarOverlay.addEventListener('click', closeSidebar);
    }
  }

  // ==================== URL State Initialization ====================

  function initUrlState() {
    const params = getUrlParams();

    currentFilter.search = params.q;
    currentFilter.category = params.cat;
    currentFilter.sort = params.sort;
    currentFilter.tags = params.tags;

    if (dom.searchInput && params.q) {
      dom.searchInput.value = params.q;
    }
    if (dom.sortSelect && params.sort) {
      dom.sortSelect.value = params.sort;
    }

    renderFilterBar();
    updateSidebarActiveState();
  }

  // ==================== App Initialization ====================

  function initApp() {
    cacheDom();
    renderSidebarStats();
    renderSidebarCategories();
    renderLastUpdated();
    initUrlState();
    renderContent();
    initDarkMode();
    initBackToTop();
    initEventDelegation();
  }

  // ==================== Bootstrap ====================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadData);
  } else {
    loadData();
  }

})();
