// 全局变量
let allData = [];
let filteredData = [];
let currentPage = 1;
const itemsPerPage = 50;
let fieldMapping = {};

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

// 加载数据
async function loadData() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    allData = await response.json();
    console.log(`加载了 ${allData.length} 条记录`);
  } catch (error) {
    console.error("加载数据失败:", error);
    throw error;
  }
}

// 加载字段映射
async function loadFieldMapping() {
  try {
    const response = await fetch("field_mapping.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    fieldMapping = await response.json();
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
  elements.prevPageBtn.addEventListener("click", () => changePage(-1));
  elements.nextPageBtn.addEventListener("click", () => changePage(1));

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
    select.addEventListener("change", performSearch);
  });
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

  // 清空表格
  elements.resultsTbody.innerHTML = "";

  // 填充表格数据
  currentItems.forEach((item) => {
    const row = createTableRow(item);
    elements.resultsTbody.appendChild(row);
  });

  // 绑定提示框事件
  bindTooltipEvents();
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

// 翻页
function changePage(direction) {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const newPage = currentPage + direction;

  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    displayResults();
  }
}

// 绑定提示框事件
function bindTooltipEvents() {
  const tooltipElements = document.querySelectorAll("[data-tooltip]");

  tooltipElements.forEach((element) => {
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
