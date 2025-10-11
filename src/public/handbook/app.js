// 全局变量
let allPdfList = [];
let filteredPdfList = [];

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

// DOM元素
const searchInput = document.getElementById('handbook-search');
const searchBtn = document.getElementById('search-btn');
const resetBtn = document.getElementById('reset-btn');
const handbookList = document.getElementById('handbook-list');
const resultsCount = document.getElementById('results-count');
const loading = document.getElementById('loading');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  initPdfButtonEvents();
  loadPdfList();
});

// 绑定事件
function bindEvents() {
  searchBtn.addEventListener('click', performSearch);
  resetBtn.addEventListener('click', resetSearch);
  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    } else {
      // 实时搜索
      performSearch();
    }
  });
}

// 加载PDF列表
async function loadPdfList() {
  showLoading(true);
  
  try {
    const response = await fetch('/api/pdf-list');
    if (!response.ok) {
      throw new Error('加载PDF列表失败');
    }
    
    allPdfList = await response.json();
    filteredPdfList = allPdfList;
    renderPdfList();
    
  } catch (error) {
    console.error('加载PDF列表失败:', error);
    renderErrorState();
  } finally {
    showLoading(false);
  }
}

// 执行搜索
function performSearch() {
  const keyword = searchInput.value.trim().toLowerCase();
  
  if (!keyword) {
    filteredPdfList = allPdfList;
  } else {
    // 解析分号分隔的批量搜索
    const keywords = parseKeywords(keyword);
    
    // 模糊搜索：匹配文件名、编号或中文名称（支持批量）
    filteredPdfList = allPdfList.filter(pdf => {
      const searchText = `${pdf.prefix} ${pdf.name} ${pdf.enFile} ${pdf.chineseName || ''}`.toLowerCase();
      return keywords.some(kw => searchText.includes(kw));
    });
  }
  
  renderPdfList();
}

// 重置搜索
function resetSearch() {
  searchInput.value = '';
  filteredPdfList = allPdfList;
  renderPdfList();
  searchInput.focus();
}

// 渲染PDF列表
function renderPdfList() {
  const count = filteredPdfList.length;
  resultsCount.textContent = `共 ${count} 条文档`;
  
  if (count === 0) {
    renderEmptyState();
    return;
  }
  
  const fragment = document.createDocumentFragment();
  filteredPdfList.forEach(pdf => {
    const item = createPdfItem(pdf);
    fragment.appendChild(item);
  });
  
  handbookList.innerHTML = '';
  handbookList.appendChild(fragment);
}

// 渲染错误状态
function renderErrorState() {
  const div = document.createElement('div');
  div.style.textAlign = 'center';
  div.style.padding = '40px';
  div.style.color = 'var(--google-red)';
  
  const p = document.createElement('p');
  p.textContent = '加载文档列表失败，请刷新页面重试';
  div.appendChild(p);
  
  handbookList.innerHTML = '';
  handbookList.appendChild(div);
}

// 渲染空状态
function renderEmptyState() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  
  const p1 = document.createElement('p');
  p1.textContent = '未找到匹配的文档';
  div.appendChild(p1);
  
  const p2 = document.createElement('p');
  p2.style.fontSize = '13px';
  p2.style.color = 'var(--google-grey-600)';
  p2.style.marginTop = '8px';
  p2.textContent = '请尝试其他关键词';
  div.appendChild(p2);
  
  handbookList.innerHTML = '';
  handbookList.appendChild(div);
}

// 创建PDF列表项
function createPdfItem(pdf) {
  const div = document.createElement('div');
  div.className = 'handbook-item';
  
  // 文档信息
  const infoDiv = document.createElement('div');
  infoDiv.className = 'handbook-info';
  
  const numberDiv = document.createElement('div');
  numberDiv.className = 'handbook-number';
  numberDiv.textContent = pdf.prefix;
  infoDiv.appendChild(numberDiv);
  
  const namesDiv = document.createElement('div');
  namesDiv.className = 'handbook-names';
  
  const nameEn = document.createElement('div');
  nameEn.className = 'handbook-name-en';
  nameEn.textContent = pdf.name;
  namesDiv.appendChild(nameEn);
  
  if (pdf.chineseName) {
    const nameZh = document.createElement('div');
    nameZh.className = 'handbook-name-zh';
    nameZh.textContent = pdf.chineseName;
    namesDiv.appendChild(nameZh);
  }
  
  infoDiv.appendChild(namesDiv);
  div.appendChild(infoDiv);
  
  // 操作按钮
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'handbook-actions';
  
  // 英文PDF按钮
  actionsDiv.appendChild(createPdfButton('英文PDF', pdf.enPath, 'btn-pdf-en', false));
  
  // 中文PDF按钮
  const hasZh = pdf.zhFile !== null;
  actionsDiv.appendChild(createPdfButton(
    '中文PDF', 
    pdf.zhPath, 
    'btn-pdf-zh', 
    !hasZh,
    hasZh ? '在新标签页打开中文PDF' : '暂无中文版'
  ));
  
  div.appendChild(actionsDiv);
  
  return div;
}

// 创建PDF按钮
function createPdfButton(text, path, className, disabled = false, title = '') {
  const btn = document.createElement('button');
  btn.className = `btn-pdf ${className}`;
  
  if (disabled) {
    btn.classList.add('disabled');
    btn.disabled = true;
  } else {
    btn.dataset.pdfPath = path;
  }
  
  btn.title = title || `在新标签页打开${text}`;
  
  // SVG图标
  const svg = createPdfIcon();
  btn.appendChild(svg);
  
  // 文字
  const textNode = document.createTextNode(text);
  btn.appendChild(textNode);
  
  return btn;
}

// 创建PDF图标
function createPdfIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.innerHTML = `
    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 2V8H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `;
  return svg;
}

// 打开PDF（通过事件委托调用）
function openPdf(pdfPath) {
  window.open(pdfPath, '_blank');
}

// 初始化按钮事件（事件委托）
function initPdfButtonEvents() {
  handbookList.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-pdf:not(.disabled)');
    if (!btn) return;
    
    const pdfPath = btn.dataset.pdfPath;
    if (pdfPath) {
      openPdf(pdfPath);
    }
  });
}

// 显示/隐藏加载动画
function showLoading(show) {
  loading.style.display = show ? 'block' : 'none';
}

