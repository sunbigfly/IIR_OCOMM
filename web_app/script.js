// 全局变量
let allData = [];
let filteredData = [];
let currentPage = 1;
const itemsPerPage = 50;
let fieldMapping = {};

// 缓存配置
const CACHE_CONFIG = {
  DATA_KEY: "iir_ocomm_data",
  VERSION_KEY: "iir_ocomm_data_version",
  EXPIRY_KEY: "iir_ocomm_cache_expiry",
  DEFAULT_EXPIRY_HOURS: 24, // 默认缓存24小时
};

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
  refreshCacheBtn: document.getElementById("refresh-cache-btn"),
  cacheInfoBtn: document.getElementById("cache-info-btn"),
  resultsCount: document.getElementById("results-count"),
  pageInfo: document.getElementById("page-info"),
  prevPageBtn: document.getElementById("prev-page"),
  nextPageBtn: document.getElementById("next-page"),
  resultsTable: document.getElementById("results-table"),
  resultsTbody: document.getElementById("results-tbody"),
  tooltip: document.getElementById("tooltip"),
};

// 初始化应用
async function initApp() {
  showLoading(true);

  try {
    // 加载数据和字段映射
    await Promise.all([loadData(), loadFieldMapping()]);

    // 初始化UI
    initializeDropdowns();
    bindEvents();

    // 显示所有数据
    filteredData = [...allData];
    displayResults();
  } catch (error) {
    console.error("初始化失败:", error);
    alert("数据加载失败，请刷新页面重试");
  } finally {
    showLoading(false);
  }
}

// 缓存管理函数
const CacheManager = {
  // 检查缓存是否有效
  isCacheValid() {
    try {
      const expiry = localStorage.getItem(CACHE_CONFIG.EXPIRY_KEY);
      if (!expiry) return false;

      const expiryTime = new Date(expiry);
      const now = new Date();
      return now < expiryTime;
    } catch (error) {
      console.warn("缓存过期检查失败:", error);
      return false;
    }
  },

  // 从缓存获取数据
  getFromCache(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.warn(`从缓存获取数据失败 (${key}):`, error);
      return null;
    }
  },

  // 保存数据到缓存
  saveToCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.warn(`保存数据到缓存失败 (${key}):`, error);
      // 如果存储空间不足，尝试清理缓存
      if (error.name === "QuotaExceededError") {
        this.clearCache();
        try {
          localStorage.setItem(key, JSON.stringify(data));
          return true;
        } catch (retryError) {
          console.error("重试缓存保存失败:", retryError);
        }
      }
      return false;
    }
  },

  // 设置缓存过期时间
  setCacheExpiry(hours = CACHE_CONFIG.DEFAULT_EXPIRY_HOURS) {
    try {
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + hours);
      localStorage.setItem(CACHE_CONFIG.EXPIRY_KEY, expiry.toISOString());
    } catch (error) {
      console.warn("设置缓存过期时间失败:", error);
    }
  },

  // 清理所有缓存
  clearCache() {
    try {
      Object.values(CACHE_CONFIG).forEach((key) => {
        localStorage.removeItem(key);
      });
      console.log("缓存已清理");
      return true;
    } catch (error) {
      console.error("清理缓存失败:", error);
      return false;
    }
  },

  // 获取缓存大小信息
  getCacheInfo() {
    try {
      const dataString = localStorage.getItem(CACHE_CONFIG.DATA_KEY) || "";
      // 使用 Blob 获取更准确的字节大小
      const dataSize = new Blob([dataString]).size;

      return {
        dataSize: (dataSize / 1024 / 1024).toFixed(2) + " MB",
        totalSize: (dataSize / 1024 / 1024).toFixed(2) + " MB",
        isValid: this.isCacheValid(),
        expiry: localStorage.getItem(CACHE_CONFIG.EXPIRY_KEY),
      };
    } catch (error) {
      console.warn("获取缓存信息失败:", error);
      return null;
    }
  },
};

// 加载数据 - 带缓存支持
async function loadData() {
  const loadingElement = elements.loading;

  try {
    // 首先尝试从缓存加载
    if (CacheManager.isCacheValid()) {
      const cachedData = CacheManager.getFromCache(CACHE_CONFIG.DATA_KEY);
      if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
        allData = cachedData;
        console.log(`从缓存加载了 ${allData.length} 条记录`);
        showCacheStatus("cache");
        return;
      }
    }

    // 缓存无效或不存在，从网络加载
    console.log("从网络加载数据...");
    showCacheStatus("downloading");

    const response = await fetch("data.json", {
      cache: "no-cache", // 确保获取最新数据
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    allData = await response.json();
    console.log(`从网络加载了 ${allData.length} 条记录`);

    // 保存到缓存
    if (CacheManager.saveToCache(CACHE_CONFIG.DATA_KEY, allData)) {
      CacheManager.setCacheExpiry();
      console.log("数据已缓存");
      showCacheStatus("cached");
    } else {
      showCacheStatus("network");
    }
  } catch (error) {
    console.error("加载数据失败:", error);

    // 如果网络加载失败，尝试使用过期的缓存数据
    const cachedData = CacheManager.getFromCache(CACHE_CONFIG.DATA_KEY);
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
    const response = await fetch("field_mapping.json");
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
  // 获取唯一的ROUTE值和对应的中文名
  const routeMap = new Map();
  allData.forEach((item) => {
    if (item.ROUTE) {
      const routeCn = item["ROUTE(中文名)"] || "";
      routeMap.set(item.ROUTE, routeCn);
    }
  });
  const uniqueRoutes = [...routeMap.keys()].sort();
  populateDropdownWithTranslation(elements.routeSearch, uniqueRoutes, routeMap);

  // 获取唯一的DOSAGE_FORM值和对应的中文名
  const dosageFormMap = new Map();
  allData.forEach((item) => {
    if (item.DOSAGE_FORM) {
      const dosageFormCn = item["DOSAGE_FORM(中文名)"] || "";
      dosageFormMap.set(item.DOSAGE_FORM, dosageFormCn);
    }
  });
  const uniqueDosageForms = [...dosageFormMap.keys()].sort();
  populateDropdownWithTranslation(
    elements.dosageFormSearch,
    uniqueDosageForms,
    dosageFormMap
  );
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

  // 添加新选项
  options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option;
    const translation = translationMap.get(option);
    // 如果有中文翻译，显示中文+英文备注，否则只显示英文
    optionElement.textContent = translation
      ? `${translation} (${option})`
      : option;
    selectElement.appendChild(optionElement);
  });
}

// 绑定事件
function bindEvents() {
  elements.searchBtn.addEventListener("click", performSearch);
  elements.resetBtn.addEventListener("click", resetSearch);
  elements.refreshCacheBtn.addEventListener("click", refreshCache);
  elements.cacheInfoBtn.addEventListener("click", showCacheInfo);
  elements.prevPageBtn.addEventListener("click", () => changePage(-1));
  elements.nextPageBtn.addEventListener("click", () => changePage(1));

  // 回车键搜索
  [elements.ingredientSearch, elements.casSearch, elements.uniiSearch].forEach(
    (input) => {
      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          performSearch();
          // 移动端搜索后聚焦到结果区域
          if (isMobileDevice()) {
            setTimeout(() => {
              const resultsHeader = document.querySelector("#results-heading");
              if (resultsHeader) {
                resultsHeader.focus();
                resultsHeader.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }
            }, 500);
          }
        }
      });
    }
  );

  // 下拉框变化时自动搜索
  [elements.routeSearch, elements.dosageFormSearch].forEach((select) => {
    select.addEventListener("change", (e) => {
      performSearch();
      // 移动端选择后提供反馈
      if (isMobileDevice()) {
        announceToScreenReader(
          `已选择${e.target.options[e.target.selectedIndex].text}`
        );
      }
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

  // 移动端特殊键盘支持
  if (isMobileDevice()) {
    // Tab键优化焦点管理
    if (e.key === "Tab") {
      // 确保焦点在可见元素上
      setTimeout(() => {
        const focusedElement = document.activeElement;
        if (focusedElement && focusedElement.offsetParent === null) {
          // 如果焦点元素不可见，移动到下一个可见元素
          const nextFocusable = getNextFocusableElement(focusedElement);
          if (nextFocusable) {
            nextFocusable.focus();
          }
        }
      }, 0);
    }
  }
}

// 获取下一个可聚焦元素
function getNextFocusableElement(currentElement) {
  const focusableElements = document.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const currentIndex = Array.from(focusableElements).indexOf(currentElement);
  return focusableElements[currentIndex + 1] || focusableElements[0];
}

// 屏幕阅读器公告
function announceToScreenReader(message) {
  const announcement = document.createElement("div");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  announcement.className = "sr-only";
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // 清理公告元素
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

// 执行搜索
function performSearch() {
  const filters = {
    ingredient: elements.ingredientSearch.value.trim().toLowerCase(),
    route: elements.routeSearch.value,
    dosageForm: elements.dosageFormSearch.value,
    cas: elements.casSearch.value.trim(),
    unii: elements.uniiSearch.value.trim().toLowerCase(),
  };

  filteredData = allData.filter((item) => {
    // 成分名称搜索（支持中英文）
    if (filters.ingredient) {
      const ingredientName = (item.INGREDIENT_NAME || "").toLowerCase();
      const ingredientNameCn = (
        item["INGREDIENT_NAME(中文名)"] || ""
      ).toLowerCase();
      if (
        !ingredientName.includes(filters.ingredient) &&
        !ingredientNameCn.includes(filters.ingredient)
      ) {
        return false;
      }
    }

    // 给药途径过滤
    if (filters.route && item.ROUTE !== filters.route) {
      return false;
    }

    // 剂型过滤
    if (filters.dosageForm && item.DOSAGE_FORM !== filters.dosageForm) {
      return false;
    }

    // CAS号搜索
    if (filters.cas) {
      const casNumber = String(item.CAS_NUMBER || "");
      if (!casNumber.includes(filters.cas)) {
        return false;
      }
    }

    // UNII搜索
    if (filters.unii) {
      const unii = (item.UNII || "").toLowerCase();
      if (!unii.includes(filters.unii)) {
        return false;
      }
    }

    return true;
  });

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

  // 检测是否为移动端 - 使用更精确的检测
  const isMobile = isMobileDevice();

  if (isMobile) {
    displayMobileCards(currentItems);
  } else {
    displayTable(currentItems);
  }

  // 绑定提示框事件
  bindTooltipEvents();

  // 移动端优化：滚动到结果顶部
  if (isMobile && currentPage > 1) {
    const resultsSection = document.querySelector(".results-section");
    if (resultsSection) {
      resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

// 显示桌面端表格
function displayTable(currentItems) {
  // 确保表格容器可见，隐藏移动端卡片
  const tableContainer = document.querySelector(".table-container");
  const mobileContainer = document.querySelector(".mobile-cards");

  if (tableContainer) tableContainer.style.display = "block";
  if (mobileContainer) mobileContainer.style.display = "none";

  // 清空表格
  elements.resultsTbody.innerHTML = "";

  // 填充表格数据
  currentItems.forEach((item) => {
    const row = createTableRow(item);
    elements.resultsTbody.appendChild(row);
  });
}

// 显示移动端卡片
function displayMobileCards(currentItems) {
  // 确保移动端容器可见，隐藏表格
  const tableContainer = document.querySelector(".table-container");
  let mobileContainer = document.querySelector(".mobile-cards");

  if (tableContainer) tableContainer.style.display = "none";

  // 如果移动端容器不存在，创建它
  if (!mobileContainer) {
    mobileContainer = document.createElement("div");
    mobileContainer.className = "mobile-cards";
    tableContainer.parentNode.insertBefore(
      mobileContainer,
      tableContainer.nextSibling
    );
  }

  mobileContainer.style.display = "block";
  mobileContainer.innerHTML = "";

  // 添加卡片
  currentItems.forEach((item) => {
    const card = createMobileCard(item);
    mobileContainer.appendChild(card);
  });
}

// 创建表格行
function createTableRow(item) {
  const row = document.createElement("tr");

  // 成分名称（显示中英文）
  const ingredientCell = document.createElement("td");
  const ingredientName = item.INGREDIENT_NAME || "";
  const ingredientNameCn = item["INGREDIENT_NAME(中文名)"] || "";
  ingredientCell.innerHTML = ingredientNameCn
    ? `${ingredientNameCn}<br><small style="color: #666;">${ingredientName}</small>`
    : ingredientName;
  row.appendChild(ingredientCell);

  // 给药途径（带提示）
  const routeCell = document.createElement("td");
  routeCell.className = "route-cell";
  const routeName = item.ROUTE || "";
  const routeNameCn = item["ROUTE(中文名)"] || "";
  const routeExplanation = item["ROUTE 解释说明 (Explanation)"] || "";
  routeCell.innerHTML = routeNameCn
    ? `${routeNameCn}<br><small style="color: #666;">${routeName}</small>`
    : routeName;
  if (routeExplanation) {
    routeCell.setAttribute("data-tooltip", routeExplanation);
  }
  row.appendChild(routeCell);

  // 剂型（带提示）
  const dosageFormCell = document.createElement("td");
  dosageFormCell.className = "dosage-form-cell";
  const dosageFormName = item.DOSAGE_FORM || "";
  const dosageFormNameCn = item["DOSAGE_FORM(中文名)"] || "";
  const dosageFormExplanation =
    item["DOSAGE_FORM 解释说明 (Explanation)"] || "";
  dosageFormCell.innerHTML = dosageFormNameCn
    ? `${dosageFormNameCn}<br><small style="color: #666;">${dosageFormName}</small>`
    : dosageFormName;
  if (dosageFormExplanation) {
    dosageFormCell.setAttribute("data-tooltip", dosageFormExplanation);
  }
  row.appendChild(dosageFormCell);

  // 其他字段
  const fields = [
    "CAS_NUMBER",
    "UNII",
    "POTENCY_AMOUNT",
    "POTENCY_UNIT",
    "MAXIMUM_DAILY_EXPOSURE",
    "MAXIMUM_DAILY_EXPOSURE_UNIT",
    "RECORD_UPDATED",
  ];

  fields.forEach((field) => {
    const cell = document.createElement("td");
    const value = item[field];
    cell.textContent = value !== null && value !== undefined ? value : "";
    row.appendChild(cell);
  });

  return row;
}

// 创建移动端卡片
function createMobileCard(item) {
  const card = document.createElement("div");
  card.className = "mobile-card";

  // 添加卡片点击事件（用于展开/收起详细信息）
  card.setAttribute("data-expanded", "false");

  // 卡片标题（成分名称）
  const header = document.createElement("div");
  header.className = "mobile-card-header";
  const ingredientName = item.INGREDIENT_NAME || "";
  const ingredientNameCn = item["INGREDIENT_NAME(中文名)"] || "";

  // 创建标题内容
  const titleText = ingredientNameCn ? `${ingredientNameCn}` : ingredientName;
  const subtitleText = ingredientNameCn ? ingredientName : "";

  header.innerHTML = `
    <div class="card-title">${titleText}</div>
    ${subtitleText ? `<div class="card-subtitle">${subtitleText}</div>` : ""}
  `;
  card.appendChild(header);

  // 创建字段行的辅助函数
  function createCardRow(label, value, tooltip = null, isImportant = false) {
    const row = document.createElement("div");
    row.className = `mobile-card-row ${isImportant ? "important" : ""}`;

    const labelDiv = document.createElement("div");
    labelDiv.className = "mobile-card-label";
    labelDiv.textContent = label;

    const valueDiv = document.createElement("div");
    valueDiv.className = "mobile-card-value";
    if (tooltip) {
      valueDiv.className += " with-tooltip";
      valueDiv.setAttribute("data-tooltip", tooltip);
      valueDiv.setAttribute(
        "aria-label",
        `${label}: ${value || "无数据"}. 点击查看详细说明`
      );
    }

    // 处理空值显示
    const displayValue = value && value.toString().trim() !== "" ? value : "—";
    valueDiv.innerHTML = displayValue;

    row.appendChild(labelDiv);
    row.appendChild(valueDiv);
    return row;
  }

  // 给药途径
  const routeName = item.ROUTE || "";
  const routeNameCn = item["ROUTE(中文名)"] || "";
  const routeExplanation = item["ROUTE 解释说明 (Explanation)"] || "";
  const routeDisplay = routeNameCn
    ? `${routeNameCn}<br><small style="color: #666;">${routeName}</small>`
    : routeName;
  card.appendChild(createCardRow("给药途径", routeDisplay, routeExplanation));

  // 剂型
  const dosageFormName = item.DOSAGE_FORM || "";
  const dosageFormNameCn = item["DOSAGE_FORM(中文名)"] || "";
  const dosageFormExplanation =
    item["DOSAGE_FORM 解释说明 (Explanation)"] || "";
  const dosageFormDisplay = dosageFormNameCn
    ? `${dosageFormNameCn}<br><small style="color: #666;">${dosageFormName}</small>`
    : dosageFormName;
  card.appendChild(
    createCardRow("剂型", dosageFormDisplay, dosageFormExplanation)
  );

  // 其他字段
  card.appendChild(createCardRow("CAS号", item.CAS_NUMBER));
  card.appendChild(createCardRow("UNII", item.UNII));
  card.appendChild(createCardRow("效价量", item.POTENCY_AMOUNT));
  card.appendChild(createCardRow("效价单位", item.POTENCY_UNIT));
  card.appendChild(createCardRow("最大日暴露量", item.MAXIMUM_DAILY_EXPOSURE));
  card.appendChild(
    createCardRow("暴露量单位", item.MAXIMUM_DAILY_EXPOSURE_UNIT)
  );
  card.appendChild(createCardRow("记录更新时间", item.RECORD_UPDATED));

  return card;
}

// 翻页
function changePage(direction) {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const newPage = currentPage + direction;

  if (newPage >= 1 && newPage <= totalPages) {
    // 显示加载状态（移动端优化）
    if (isMobileDevice()) {
      showPageLoading(true);
    }

    currentPage = newPage;

    // 使用 requestAnimationFrame 优化性能
    requestAnimationFrame(() => {
      displayResults();

      if (isMobileDevice()) {
        showPageLoading(false);
        // 平滑滚动到结果顶部
        const resultsHeader = document.querySelector(".results-header");
        if (resultsHeader) {
          smoothScrollToElement(resultsHeader, 20);
        }
      }
    });
  }
}

// 显示分页加载状态
function showPageLoading(show) {
  const mobileContainer = document.querySelector(".mobile-cards");
  const tableContainer = document.querySelector(".table-container");

  if (show) {
    if (mobileContainer) {
      mobileContainer.style.opacity = "0.6";
      mobileContainer.style.pointerEvents = "none";
    }
    if (tableContainer) {
      tableContainer.style.opacity = "0.6";
      tableContainer.style.pointerEvents = "none";
    }
  } else {
    if (mobileContainer) {
      mobileContainer.style.opacity = "1";
      mobileContainer.style.pointerEvents = "auto";
    }
    if (tableContainer) {
      tableContainer.style.opacity = "1";
      tableContainer.style.pointerEvents = "auto";
    }
  }
}

// 绑定提示框事件
function bindTooltipEvents() {
  const tooltipElements = document.querySelectorAll("[data-tooltip]");

  tooltipElements.forEach((element) => {
    // 鼠标事件（桌面端）
    element.addEventListener("mouseenter", showTooltip);
    element.addEventListener("mouseleave", hideTooltip);
    element.addEventListener("mousemove", moveTooltip);

    // 触摸事件（移动端）
    element.addEventListener("touchstart", handleTouchTooltip);
    element.addEventListener("click", handleClickTooltip);
  });

  // 点击其他地方隐藏提示框
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-tooltip]")) {
      hideTooltip();
    }
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

// 处理触摸设备的提示框
function handleTouchTooltip(event) {
  event.preventDefault();
  const tooltipText = event.target.getAttribute("data-tooltip");
  if (tooltipText) {
    // 添加触觉反馈（如果支持）
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    elements.tooltip.textContent = tooltipText;
    elements.tooltip.style.display = "block";
    elements.tooltip.classList.add("mobile-tooltip");

    // 在触摸位置显示提示框
    const touch = event.touches[0];
    positionTooltipForTouch(touch.clientX, touch.clientY);

    // 自动隐藏提示框（移动端体验优化）
    setTimeout(() => {
      hideTooltip();
    }, 4000);
  }
}

// 处理点击显示提示框（移动端）
function handleClickTooltip(event) {
  // 检测是否为触摸设备
  if (isMobileDevice()) {
    event.preventDefault();
    event.stopPropagation();

    const tooltipText = event.target.getAttribute("data-tooltip");
    if (tooltipText) {
      // 如果提示框已经显示且是同一个元素，则隐藏
      if (
        elements.tooltip.style.display === "block" &&
        elements.tooltip.getAttribute("data-current-target") ===
          event.target.outerHTML
      ) {
        hideTooltip();
        return;
      }

      // 添加触觉反馈
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }

      elements.tooltip.textContent = tooltipText;
      elements.tooltip.style.display = "block";
      elements.tooltip.classList.add("mobile-tooltip");
      elements.tooltip.setAttribute(
        "data-current-target",
        event.target.outerHTML
      );

      positionTooltipForTouch(event.clientX, event.clientY);

      // 移动端自动隐藏
      setTimeout(() => {
        hideTooltip();
      }, 5000);
    }
  }
}

// 为触摸设备定位提示框
function positionTooltipForTouch(clientX, clientY) {
  const tooltip = elements.tooltip;
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = clientX - tooltipRect.width / 2;
  let top = clientY - tooltipRect.height - 20;

  // 防止超出左右边界
  if (left < 10) left = 10;
  if (left + tooltipRect.width > viewportWidth - 10) {
    left = viewportWidth - tooltipRect.width - 10;
  }

  // 防止超出上下边界
  if (top < 10) {
    top = clientY + 20;
  }
  if (top + tooltipRect.height > viewportHeight - 10) {
    top = viewportHeight - tooltipRect.height - 10;
  }

  tooltip.style.left = left + "px";
  tooltip.style.top = top + "px";
}

// 显示/隐藏加载动画
function showLoading(show) {
  elements.loading.style.display = show ? "block" : "none";
  elements.resultsTable.style.opacity = show ? "0.5" : "1";
}

// 显示缓存状态
function showCacheStatus(status) {
  // 移除现有的缓存状态提示
  const existingStatus = document.querySelector(".cache-status");
  if (existingStatus) {
    existingStatus.remove();
  }

  let message = "";
  let className = "cache-status";

  switch (status) {
    case "cache":
      message = "📁 从本地缓存加载";
      className += " cache-hit";
      break;
    case "downloading":
      message = "⬇️ 正在下载最新数据...";
      className += " cache-downloading";
      break;
    case "cached":
      message = "✅ 数据已缓存到本地";
      className += " cache-success";
      break;
    case "network":
      message = "🌐 从网络加载（缓存失败）";
      className += " cache-network";
      break;
    case "offline":
      message = "⚠️ 网络连接失败，使用离线缓存";
      className += " cache-offline";
      break;
    default:
      return;
  }

  // 创建状态提示元素
  const statusElement = document.createElement("div");
  statusElement.className = className;
  statusElement.textContent = message;

  // 插入到结果计数的旁边
  const resultsCount = elements.resultsCount;
  if (resultsCount && resultsCount.parentNode) {
    resultsCount.parentNode.insertBefore(
      statusElement,
      resultsCount.nextSibling
    );
  }

  // 3秒后自动隐藏（除了离线状态）
  if (status !== "offline") {
    setTimeout(() => {
      if (statusElement.parentNode) {
        statusElement.remove();
      }
    }, 3000);
  }
}

// 手动刷新缓存
async function refreshCache() {
  try {
    showLoading(true);
    showCacheStatus("downloading");

    // 清除现有缓存
    CacheManager.clearCache();

    // 重新加载数据
    await Promise.all([loadData(), loadFieldMapping()]);

    // 重新初始化界面
    initializeDropdowns();
    filteredData = [...allData];
    displayResults();

    showCacheStatus("cached");
    console.log("缓存刷新完成");
  } catch (error) {
    console.error("刷新缓存失败:", error);
    alert("刷新缓存失败，请检查网络连接");
  } finally {
    showLoading(false);
  }
}

// 显示缓存信息
function showCacheInfo() {
  const info = CacheManager.getCacheInfo();
  if (!info) {
    alert("无法获取缓存信息");
    return;
  }

  const isValid = info.isValid ? "有效" : "已过期";
  const expiry = info.expiry
    ? new Date(info.expiry).toLocaleString("zh-CN")
    : "未设置";

  const message = `缓存信息：
• 数据大小：${info.dataSize}
• 状态：${isValid}
• 过期时间：${expiry}`;

  alert(message);
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

// 窗口大小变化时重新渲染
window.addEventListener(
  "resize",
  debounce(() => {
    displayResults();
  }, 250)
);

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 移动设备检测函数
function isMobileDevice() {
  // 综合检测移动设备
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUA =
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent
    );
  const isSmallScreen = window.innerWidth <= 768;
  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  return isMobileUA || (isSmallScreen && isTouchDevice);
}

// 优化的移动端滚动函数
function smoothScrollToElement(element, offset = 0) {
  if (!element) return;

  const elementPosition =
    element.getBoundingClientRect().top + window.pageYOffset;
  const offsetPosition = elementPosition - offset;

  window.scrollTo({
    top: offsetPosition,
    behavior: "smooth",
  });
}

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", initApp);
