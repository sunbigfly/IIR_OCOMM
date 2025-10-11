// 全局变量
let allData = [];
let filteredData = [];
let currentPage = 1;
let itemsPerPage = 50; // 改为变量，支持用户自定义每页行数
let fieldMapping = {};

// 缓存配置
const CACHE_CONFIG = {
  DATA_KEY: "iir_ocomm_data",
  VERSION_KEY: "iir_ocomm_data_version",
  EXPIRY_KEY: "iir_ocomm_cache_expiry",
  DEFAULT_EXPIRY_HOURS: 24, // 默认缓存24小时
};

// ============================================
// 字段名常量
// ============================================

const FIELD_NAMES = {
  // 英文字段
  INGREDIENT_NAME: 'INGREDIENT_NAME',
  ROUTE: 'ROUTE',
  DOSAGE_FORM: 'DOSAGE_FORM',
  CAS_NUMBER: 'CAS_NUMBER',
  UNII: 'UNII',
  POTENCY_AMOUNT: 'POTENCY_AMOUNT',
  POTENCY_UNIT: 'POTENCY_UNIT',
  MAXIMUM_DAILY_EXPOSURE: 'MAXIMUM_DAILY_EXPOSURE',
  MAXIMUM_DAILY_EXPOSURE_UNIT: 'MAXIMUM_DAILY_EXPOSURE_UNIT',
  RECORD_UPDATED: 'RECORD_UPDATED',
  
  // 中文字段
  INGREDIENT_NAME_CN: 'INGREDIENT_NAME(中文名)',
  ROUTE_CN: 'ROUTE(中文名)',
  DOSAGE_FORM_CN: 'DOSAGE_FORM(中文名)',
  
  // 解释说明字段
  ROUTE_EXPLANATION: 'ROUTE 解释说明 (Explanation)',
  DOSAGE_FORM_EXPLANATION: 'DOSAGE_FORM 解释说明 (Explanation)'
};

// ============================================
// 工具函数
// ============================================

/**
 * 解析分号分隔的关键词字符串
 * @param {string} input - 输入字符串，可能包含分号分隔的多个关键词
 * @returns {string[]} - 关键词数组
 */
function parseKeywords(input) {
  return input ? input.split(/[;；]/).map(k => k.trim()).filter(k => k) : [];
}

/**
 * 从数据中提取唯一值及其翻译
 * @param {Array} data - 数据数组
 * @param {string} field - 要提取的字段名
 * @param {string} translationField - 翻译字段名
 * @returns {Map} - 值到翻译的映射
 */
function extractUniqueValues(data, field, translationField) {
  const valueMap = new Map();
  data.forEach(item => {
    if (item[field]) {
      const translation = item[translationField] || "";
      valueMap.set(item[field], translation);
    }
  });
  return valueMap;
}

// DOM元素
const elements = {
  loading: document.getElementById("loading"),
  ingredientSearch: document.getElementById("ingredient-search"),
  routeSearch: document.getElementById("route-search"),
  dosageFormSearch: document.getElementById("dosage-form-search"),
  casSearch: document.getElementById("cas-search"),
  uniiSearch: document.getElementById("unii-search"),
  searchBtn: document.getElementById("search-btn"),
  resetBtn: document.getElementById("reset-btn"),
  downloadBtn: document.getElementById("download-btn"),
  resultsCount: document.getElementById("results-count"),
  pageInfo: document.getElementById("page-info"),
  prevPageBtn: document.getElementById("prev-page"),
  nextPageBtn: document.getElementById("next-page"),
  pageJumpInput: document.getElementById("page-jump-input"),
  pageJumpBtn: document.getElementById("page-jump-btn"),
  itemsPerPageSelect: document.getElementById("items-per-page"),
  resultsTable: document.getElementById("results-table"),
  resultsTbody: document.getElementById("results-tbody"),
  tooltip: document.getElementById("tooltip"),
};

// 初始化应用
async function initApp() {
  const appStartTime = performance.now();
  showLoading(true);

  try {
    // 加载数据和字段映射
    await Promise.all([loadData(), loadFieldMapping()]);

    // 初始化UI
    const uiStartTime = performance.now();
    initializeDropdowns();
    bindEvents();

    // 显示所有数据
    filteredData = [...allData];
    displayResults();
    
    const totalTime = (performance.now() - appStartTime).toFixed(0);
    const uiTime = (performance.now() - uiStartTime).toFixed(0);
    console.log(`✅ 应用初始化完成，总耗时 ${totalTime}ms (UI渲染 ${uiTime}ms)`);
  } catch (error) {
    console.error("初始化失败:", error);
    alert("数据加载失败，请刷新页面重试");
  } finally {
    showLoading(false);
  }
}

// ============================================
// 存储层 - 纯粹的localStorage操作
// ============================================

const StorageManager = {
  get(key) {
    try {
      const startTime = performance.now();
      const data = localStorage.getItem(key);
      if (!data) return null;
      
      const result = JSON.parse(data);
      const parseTime = (performance.now() - startTime).toFixed(0);
      console.log(`📖 localStorage读取 (${key}): ${parseTime}ms, ${(data.length / 1024 / 1024).toFixed(2)}MB`);
      return result;
    } catch (error) {
      console.error(`❌ localStorage读取失败 (${key}):`, error);
      // 数据损坏，删除它
      try {
        localStorage.removeItem(key);
      } catch {}
      return null;
    }
  },

  set(key, value) {
    try {
      const startTime = performance.now();
      const jsonString = JSON.stringify(value);
      const sizeMB = (jsonString.length / 1024 / 1024).toFixed(2);
      
      localStorage.setItem(key, jsonString);
      
      const saveTime = (performance.now() - startTime).toFixed(0);
      console.log(`💾 localStorage写入 (${key}): ${saveTime}ms, ${sizeMB}MB`);
      return true;
    } catch (error) {
      console.error(`❌ localStorage写入失败 (${key}):`, error);
      if (error.name === "QuotaExceededError") {
        console.error("⚠️ localStorage空间不足！尝试清理旧数据...");
        // 尝试清理所有缓存后重试
        this.clearAll();
        try {
          localStorage.setItem(key, JSON.stringify(value));
          console.log("✅ 清理后重试成功");
          return true;
        } catch {
          console.error("❌ 清理后仍然失败，localStorage不可用");
        }
      }
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`存储删除失败 (${key}):`, error);
      return false;
    }
  },

  getSize(key) {
    try {
      const dataString = localStorage.getItem(key) || "";
      return new Blob([dataString]).size;
    } catch (error) {
      return 0;
    }
  },
  
  clearAll() {
    try {
      const keys = Object.keys(localStorage);
      const ourKeys = keys.filter(k => k.startsWith('iir_ocomm'));
      ourKeys.forEach(k => localStorage.removeItem(k));
      console.log(`🗑️ 清理了${ourKeys.length}个缓存项`);
    } catch (error) {
      console.error("清理缓存失败:", error);
    }
  }
};

// ============================================
// 缓存管理层 - 业务逻辑
// ============================================

const CacheManager = {
  isCacheValid() {
    const expiry = StorageManager.get(CACHE_CONFIG.EXPIRY_KEY);
    return expiry && new Date() < new Date(expiry);
  },

  getData() {
    if (!this.isCacheValid()) {
      return null;
    }
    return StorageManager.get(CACHE_CONFIG.DATA_KEY);
  },

  saveData(data, hours = CACHE_CONFIG.DEFAULT_EXPIRY_HOURS) {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + hours);

    const dataStored = StorageManager.set(CACHE_CONFIG.DATA_KEY, data);
    const expiryStored = StorageManager.set(CACHE_CONFIG.EXPIRY_KEY, expiry.toISOString());

    if (dataStored && expiryStored) {
      console.log("数据已缓存");
      return true;
    } else if (!dataStored) {
      // 数据保存失败，尝试清理后重试
      this.clearAll();
      return StorageManager.set(CACHE_CONFIG.DATA_KEY, data) &&
             StorageManager.set(CACHE_CONFIG.EXPIRY_KEY, expiry.toISOString());
    }
    return false;
  },

  clearAll() {
    Object.values(CACHE_CONFIG).forEach(key => {
      StorageManager.remove(key);
    });
    console.log("缓存已清理");
  },

  getInfo() {
    const dataSize = StorageManager.getSize(CACHE_CONFIG.DATA_KEY);
    const expiry = StorageManager.get(CACHE_CONFIG.EXPIRY_KEY);

    return {
      dataSize: (dataSize / 1024 / 1024).toFixed(2) + " MB",
      totalSize: (dataSize / 1024 / 1024).toFixed(2) + " MB",
      isValid: this.isCacheValid(),
      expiry: expiry
    };
  }
};

// 加载数据 - 带缓存支持
async function loadData() {
  const loadingElement = elements.loading;

  try {
    const startTime = performance.now();
    
    // 首先尝试从缓存加载
    const cachedData = CacheManager.getData();
    if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
      allData = cachedData;
      const loadTime = (performance.now() - startTime).toFixed(0);
      console.log(`✅ 从缓存加载了 ${allData.length} 条记录，耗时 ${loadTime}ms`);
      showCacheStatus("cache");
      return;
    }

    // 缓存无效或不存在，从网络加载
    console.log("⬇️ 缓存未命中，开始从网络下载数据...");
    showCacheStatus("downloading");

    // 使用浏览器缓存策略：优先使用缓存，但检查新鲜度
    const response = await fetch("/fda/data/data.json", {
      cache: "default",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    allData = await response.json();
    const downloadTime = (performance.now() - startTime).toFixed(0);
    console.log(`⬇️ 从网络加载了 ${allData.length} 条记录，耗时 ${downloadTime}ms`);

    // 保存到缓存
    const saveStartTime = performance.now();
    if (CacheManager.saveData(allData)) {
      const saveTime = (performance.now() - saveStartTime).toFixed(0);
      console.log(`💾 数据已缓存到localStorage，耗时 ${saveTime}ms`);
      showCacheStatus("cached");
    } else {
      console.warn(`❌ 缓存保存失败（可能localStorage空间不足）`);
      showCacheStatus("network");
    }
  } catch (error) {
    console.error("加载数据失败:", error);

    // 如果网络加载失败，尝试使用过期的缓存数据（不检查有效期）
    const cachedData = StorageManager.get(CACHE_CONFIG.DATA_KEY);
    if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
      allData = cachedData;
      console.log(`网络加载失败，使用缓存数据 ${allData.length} 条记录`);
      showCacheStatus("offline");
      return;
    }

    throw error;
  }
}

// 加载字段映射 - 直接从网络加载
async function loadFieldMapping() {
  try {
    const response = await fetch("/fda/data/field_mapping.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    fieldMapping = await response.json();
    console.log("字段映射加载完成");
  } catch (error) {
    console.error("加载字段映射失败:", error);
    // 如果加载失败，使用默认映射
    fieldMapping = {};
  }
}

// 初始化下拉框
function initializeDropdowns() {
  const dropdownStartTime = performance.now();
  
  // 给药途径下拉框
  const routeMap = extractUniqueValues(allData, FIELD_NAMES.ROUTE, FIELD_NAMES.ROUTE_CN);
  const uniqueRoutes = [...routeMap.keys()].sort();
  populateDropdownWithTranslation(elements.routeSearch, uniqueRoutes, routeMap);

  // 剂型下拉框
  const dosageFormMap = extractUniqueValues(allData, FIELD_NAMES.DOSAGE_FORM, FIELD_NAMES.DOSAGE_FORM_CN);
  const uniqueDosageForms = [...dosageFormMap.keys()].sort();
  populateDropdownWithTranslation(elements.dosageFormSearch, uniqueDosageForms, dosageFormMap);
  
  const dropdownTime = (performance.now() - dropdownStartTime).toFixed(0);
  console.log(`🎛️ 下拉框初始化完成: ROUTE(${uniqueRoutes.length}项) + DOSAGE_FORM(${uniqueDosageForms.length}项)，耗时 ${dropdownTime}ms`);
}

// 填充下拉框
function populateDropdown(selectElement, options) {
  // 清除现有选项（保留"全部"选项）
  while (selectElement.children.length > 1) {
    selectElement.removeChild(selectElement.lastChild);
  }

  // 添加新选项
  options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option;
    optionElement.textContent = option;
    selectElement.appendChild(optionElement);
  });
}

// 填充带有中英文对照的下拉框
function populateDropdownWithTranslation(
  selectElement,
  options,
  translationMap
) {
  // 清除现有选项（保留"全部"选项）
  while (selectElement.children.length > 1) {
    selectElement.removeChild(selectElement.lastChild);
  }

  // 使用DocumentFragment批量插入（性能优化）
  const fragment = document.createDocumentFragment();
  options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option;
    const translation = translationMap.get(option);
    // 如果有中文翻译，显示中文+英文备注，否则只显示英文
    optionElement.textContent = translation
      ? `${translation} (${option})`
      : option;
    fragment.appendChild(optionElement);
  });
  
  // 一次性插入所有选项（只触发1次重排）
  selectElement.appendChild(fragment);
}

// 绑定事件
function bindEvents() {
  elements.searchBtn.addEventListener("click", performSearch);
  elements.resetBtn.addEventListener("click", resetSearch);
  elements.downloadBtn.addEventListener("click", downloadResults);
  elements.prevPageBtn.addEventListener("click", () => changePage(-1));
  elements.nextPageBtn.addEventListener("click", () => changePage(1));
  
  // 页面跳转
  if (elements.pageJumpBtn) {
    elements.pageJumpBtn.addEventListener("click", jumpToPage);
  }
  if (elements.pageJumpInput) {
    elements.pageJumpInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        jumpToPage();
      }
    });
  }
  
  // 每页行数改变
  if (elements.itemsPerPageSelect) {
    elements.itemsPerPageSelect.addEventListener("change", changeItemsPerPage);
  }

  // 回车键搜索
  [elements.ingredientSearch, elements.casSearch, elements.uniiSearch].forEach(
    (input) => {
      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          performSearch();
        }
      });
    }
  );

  // 下拉框变化时自动搜索
  [elements.routeSearch, elements.dosageFormSearch].forEach((select) => {
    select.addEventListener("change", (e) => {
      performSearch();
    });
  });

  // 键盘导航支持
  document.addEventListener("keydown", handleKeyboardNavigation);
}

// 键盘导航处理
function handleKeyboardNavigation(e) {
  // ESC键隐藏提示框
  if (e.key === "Escape") {
    hideTooltip();
  }
}

// 执行搜索
function performSearch() {
  const searchStartTime = performance.now();
  
  const filters = {
    ingredient: elements.ingredientSearch.value.trim().toLowerCase(),
    route: elements.routeSearch.value,
    dosageForm: elements.dosageFormSearch.value,
    cas: elements.casSearch.value.trim(),
    unii: elements.uniiSearch.value.trim().toLowerCase(),
  };

  // 搜索配置 - 关键词搜索（支持批量）
  const keywordSearches = [
    {
      keywords: parseKeywords(filters.ingredient),
      matcher: (item, kw) => {
        const name = (item[FIELD_NAMES.INGREDIENT_NAME] || "").toLowerCase();
        const nameCn = (item[FIELD_NAMES.INGREDIENT_NAME_CN] || "").toLowerCase();
        return name.includes(kw) || nameCn.includes(kw);
      }
    },
    {
      keywords: parseKeywords(filters.cas),
      matcher: (item, kw) => String(item[FIELD_NAMES.CAS_NUMBER] || "").includes(kw)
    },
    {
      keywords: parseKeywords(filters.unii),
      matcher: (item, kw) => (item[FIELD_NAMES.UNII] || "").toLowerCase().includes(kw)
    }
  ];

  // 精确匹配过滤（下拉框）
  const exactFilters = [
    { value: filters.route, field: FIELD_NAMES.ROUTE },
    { value: filters.dosageForm, field: FIELD_NAMES.DOSAGE_FORM }
  ];

  filteredData = allData.filter((item) => {
    // 下拉框精确匹配
    for (const filter of exactFilters) {
      if (filter.value && item[filter.field] !== filter.value) {
        return false;
      }
    }

    // 关键词搜索（AND逻辑：所有有关键词的搜索都要匹配）
    for (const search of keywordSearches) {
      if (search.keywords.length > 0) {
        const matched = search.keywords.some(kw => search.matcher(item, kw));
        if (!matched) {
          return false;
        }
      }
    }

    return true;
  });

  const filterTime = (performance.now() - searchStartTime).toFixed(0);
  console.log(`🔍 搜索完成: ${allData.length}条 → ${filteredData.length}条，耗时 ${filterTime}ms`);

  currentPage = 1;
  displayResults();
}

// 重置搜索
function resetSearch() {
  elements.ingredientSearch.value = "";
  elements.routeSearch.value = "";
  elements.dosageFormSearch.value = "";
  elements.casSearch.value = "";
  elements.uniiSearch.value = "";

  filteredData = [...allData];
  currentPage = 1;
  displayResults();
}

// 显示结果
function displayResults() {
  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = filteredData.slice(startIndex, endIndex);

  // 更新结果计数
  elements.resultsCount.textContent = `共 ${totalItems} 条记录`;

  // 更新分页信息
  elements.pageInfo.textContent = `第 ${currentPage} 页，共 ${totalPages} 页`;
  elements.prevPageBtn.disabled = currentPage <= 1;
  elements.nextPageBtn.disabled = currentPage >= totalPages;
  
  // 更新页面跳转输入框
  if (elements.pageJumpInput) {
    elements.pageJumpInput.value = currentPage;
    elements.pageJumpInput.max = totalPages;
  }

  displayTable(currentItems);

  // 绑定提示框事件
  bindTooltipEvents();
}

// 显示桌面端表格
function displayTable(currentItems) {
  const renderStartTime = performance.now();
  
  // 清空表格
  elements.resultsTbody.innerHTML = "";

  // 使用DocumentFragment批量插入（减少重排）
  const fragment = document.createDocumentFragment();
  currentItems.forEach((item) => {
    const row = createTableRow(item);
    fragment.appendChild(row);
  });
  
  // 一次性插入所有行（只触发1次重排）
  elements.resultsTbody.appendChild(fragment);
  
  const renderTime = (performance.now() - renderStartTime).toFixed(0);
  console.log(`📊 表格渲染完成: ${currentItems.length}行 × 10列，耗时 ${renderTime}ms`);
}

// 创建表格行（使用innerHTML模板，性能更好）
function createTableRow(item) {
  const row = document.createElement("tr");
  
  // 提取所有数据
  const ingredientName = item[FIELD_NAMES.INGREDIENT_NAME] || "";
  const ingredientNameCn = item[FIELD_NAMES.INGREDIENT_NAME_CN] || "";
  const routeName = item[FIELD_NAMES.ROUTE] || "";
  const routeNameCn = item[FIELD_NAMES.ROUTE_CN] || "";
  const routeExplanation = item[FIELD_NAMES.ROUTE_EXPLANATION] || "";
  const dosageFormName = item[FIELD_NAMES.DOSAGE_FORM] || "";
  const dosageFormNameCn = item[FIELD_NAMES.DOSAGE_FORM_CN] || "";
  const dosageFormExplanation = item[FIELD_NAMES.DOSAGE_FORM_EXPLANATION] || "";
  
  // 使用innerHTML一次性创建所有单元格（性能优化）
  row.innerHTML = `
    <td>${ingredientNameCn ? `${escapeHtml(ingredientNameCn)}<br><small style="color: #666;">${escapeHtml(ingredientName)}</small>` : escapeHtml(ingredientName)}</td>
    <td class="route-cell"${routeExplanation ? ` data-tooltip="${escapeHtml(routeExplanation)}"` : ''}>${routeNameCn ? `${escapeHtml(routeNameCn)}<br><small style="color: #666;">${escapeHtml(routeName)}</small>` : escapeHtml(routeName)}</td>
    <td class="dosage-form-cell"${dosageFormExplanation ? ` data-tooltip="${escapeHtml(dosageFormExplanation)}"` : ''}>${dosageFormNameCn ? `${escapeHtml(dosageFormNameCn)}<br><small style="color: #666;">${escapeHtml(dosageFormName)}</small>` : escapeHtml(dosageFormName)}</td>
    <td>${escapeHtml(item[FIELD_NAMES.CAS_NUMBER] || "")}</td>
    <td>${escapeHtml(item[FIELD_NAMES.UNII] || "")}</td>
    <td>${escapeHtml(item[FIELD_NAMES.POTENCY_AMOUNT] || "")}</td>
    <td>${escapeHtml(item[FIELD_NAMES.POTENCY_UNIT] || "")}</td>
    <td>${escapeHtml(item[FIELD_NAMES.MAXIMUM_DAILY_EXPOSURE] || "")}</td>
    <td>${escapeHtml(item[FIELD_NAMES.MAXIMUM_DAILY_EXPOSURE_UNIT] || "")}</td>
    <td>${escapeHtml(item[FIELD_NAMES.RECORD_UPDATED] || "")}</td>
  `.trim();

  return row;
}

// HTML转义函数（防止XSS）
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const str = String(text);
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 翻页
function changePage(direction) {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const newPage = currentPage + direction;

  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    displayResults();
  }
}

// 跳转到指定页面
function jumpToPage() {
  if (!elements.pageJumpInput) return;
  
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const targetPage = parseInt(elements.pageJumpInput.value, 10);
  
  // 验证输入
  if (isNaN(targetPage) || targetPage < 1 || targetPage > totalPages) {
    alert(`请输入有效的页码（1-${totalPages}）`);
    elements.pageJumpInput.value = currentPage;
    return;
  }
  
  if (targetPage === currentPage) {
    return; // 已经在目标页，无需跳转
  }
  
  currentPage = targetPage;
  displayResults();
}

// 改变每页显示行数
function changeItemsPerPage() {
  if (!elements.itemsPerPageSelect) return;
  
  const newItemsPerPage = parseInt(elements.itemsPerPageSelect.value, 10);
  if (isNaN(newItemsPerPage) || newItemsPerPage <= 0) return;
  
  // 计算改变行数后，当前数据应该在第几页
  // 保持用户当前浏览的数据位置尽量不变
  const currentFirstItemIndex = (currentPage - 1) * itemsPerPage;
  
  itemsPerPage = newItemsPerPage;
  
  // 计算新的页码（确保不越界）
  currentPage = Math.floor(currentFirstItemIndex / itemsPerPage) + 1;
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  currentPage = Math.max(1, Math.min(currentPage, totalPages));
  
  console.log(`每页行数已改为 ${itemsPerPage} 条`);
  
  displayResults();
}

// 绑定提示框事件
function bindTooltipEvents() {
  const tooltipElements = document.querySelectorAll("[data-tooltip]");

  tooltipElements.forEach((element) => {
    // 鼠标事件（桌面端）
    element.addEventListener("mouseenter", showTooltip);
    element.addEventListener("mouseleave", hideTooltip);
    element.addEventListener("mousemove", moveTooltip);
  });
}

// 显示提示框
function showTooltip(event) {
  const tooltipText = event.target.getAttribute("data-tooltip");
  if (tooltipText) {
    elements.tooltip.textContent = tooltipText;
    elements.tooltip.style.display = "block";
    moveTooltip(event);
  }
}

// 隐藏提示框
function hideTooltip() {
  elements.tooltip.style.display = "none";
}

// 移动提示框
function moveTooltip(event) {
  const tooltip = elements.tooltip;
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = event.pageX + 10;
  let top = event.pageY - tooltipRect.height - 10;

  // 防止提示框超出视口
  if (left + tooltipRect.width > viewportWidth) {
    left = event.pageX - tooltipRect.width - 10;
  }

  if (top < 0) {
    top = event.pageY + 10;
  }

  tooltip.style.left = left + "px";
  tooltip.style.top = top + "px";
}

// 显示/隐藏加载动画
function showLoading(show) {
  elements.loading.style.display = show ? "block" : "none";
  elements.resultsTable.style.opacity = show ? "0.5" : "1";
}

// 缓存状态（静默模式 - 无UI展示）
function showCacheStatus(status) {
  // 缓存在后台静默工作，不显示任何UI
  console.log(`缓存状态: ${status}`);
}


// 下载搜索结果为Excel文件
function downloadResults() {
  if (!filteredData || filteredData.length === 0) {
    alert("没有可下载的数据");
    return;
  }

  try {
    // 准备导出数据
    const exportData = filteredData.map((item) => ({
      "成分名称": item.INGREDIENT_NAME || "",
      "成分名称(中文)": item["INGREDIENT_NAME(中文名)"] || "",
      "给药途径": item.ROUTE || "",
      "给药途径(中文)": item["ROUTE(中文名)"] || "",
      "剂型": item.DOSAGE_FORM || "",
      "剂型(中文)": item["DOSAGE_FORM(中文名)"] || "",
      "CAS号": item.CAS_NUMBER || "",
      "UNII": item.UNII || "",
      "效价量": item.POTENCY_AMOUNT || "",
      "效价单位": item.POTENCY_UNIT || "",
      "最大日暴露量": item.MAXIMUM_DAILY_EXPOSURE || "",
      "最大日暴露量单位": item.MAXIMUM_DAILY_EXPOSURE_UNIT || "",
      "记录更新时间": item.RECORD_UPDATED || "",
    }));

    // 创建工作簿
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // 设置列宽
    const colWidths = [
      { wch: 30 }, // 成分名称
      { wch: 30 }, // 成分名称(中文)
      { wch: 15 }, // 给药途径
      { wch: 15 }, // 给药途径(中文)
      { wch: 20 }, // 剂型
      { wch: 20 }, // 剂型(中文)
      { wch: 15 }, // CAS号
      { wch: 12 }, // UNII
      { wch: 12 }, // 效价量
      { wch: 12 }, // 效价单位
      { wch: 15 }, // 最大日暴露量
      { wch: 18 }, // 最大日暴露量单位
      { wch: 18 }, // 记录更新时间
    ];
    ws["!cols"] = colWidths;

    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(wb, ws, "搜索结果");

    // 生成文件名（包含时间戳）
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `IIR_OCOMM_搜索结果_${timestamp}.xlsx`;

    // 下载文件
    XLSX.writeFile(wb, filename);

    // 提示用户
    console.log(`已导出 ${filteredData.length} 条记录到 ${filename}`);
  } catch (error) {
    console.error("导出Excel失败:", error);
    alert("导出Excel失败，请稍后重试");
  }
}

// 格式化数值
function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const num = parseFloat(value);
  if (isNaN(num)) {
    return value;
  }

  // 如果是整数，直接返回
  if (num % 1 === 0) {
    return num.toString();
  }

  // 如果是小数，保留适当的小数位数
  return num.toFixed(2).replace(/\.?0+$/, "");
}

// 错误处理
window.addEventListener("error", (event) => {
  console.error("发生错误:", event.error);
});

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", initApp);
