// 全局变量
let allPdfList = [];
let filteredPdfList = [];

// DOM元素
const searchInput = document.getElementById('handbook-search');
const searchBtn = document.getElementById('search-btn');
const resetBtn = document.getElementById('reset-btn');
const handbookList = document.getElementById('handbook-list');
const resultsCount = document.getElementById('results-count');
const loading = document.getElementById('loading');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadPdfList();
  bindEvents();
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
    handbookList.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--google-red);">
        <p>加载文档列表失败，请刷新页面重试</p>
      </div>
    `;
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
    // 解析逗号分隔的批量搜索
    const keywords = keyword
      .split(/[,，]/)
      .map(k => k.trim())
      .filter(k => k);
    
    // 模糊搜索：匹配文件名或编号（支持批量）
    filteredPdfList = allPdfList.filter(pdf => {
      const searchText = `${pdf.prefix} ${pdf.name} ${pdf.enFile}`.toLowerCase();
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
    handbookList.innerHTML = `
      <div class="empty-state">
        <p>未找到匹配的文档</p>
        <p style="font-size: 13px; color: var(--google-grey-600); margin-top: 8px;">
          请尝试其他关键词
        </p>
      </div>
    `;
    return;
  }
  
  const html = filteredPdfList.map(pdf => createPdfItem(pdf)).join('');
  handbookList.innerHTML = html;
}

// 创建PDF列表项
function createPdfItem(pdf) {
  const hasZh = pdf.zhFile !== null;
  
  return `
    <div class="handbook-item">
      <div class="handbook-info">
        <div class="handbook-number">${pdf.prefix}</div>
        <div class="handbook-name">${pdf.name}</div>
      </div>
      <div class="handbook-actions">
        <button 
          class="btn-pdf btn-pdf-en" 
          onclick="openPdf('${escapeHtml(pdf.enPath)}')"
          title="在新标签页打开英文PDF">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14 2V8H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          英文PDF
        </button>
        <button 
          class="btn-pdf btn-pdf-zh ${!hasZh ? 'disabled' : ''}" 
          onclick="${hasZh ? `openPdf('${escapeHtml(pdf.zhPath)}')` : 'return false;'}"
          ${!hasZh ? 'disabled' : ''}
          title="${hasZh ? '在新标签页打开中文PDF' : '暂无中文版'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14 2V8H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          中文PDF
        </button>
      </div>
    </div>
  `;
}

// 打开PDF
function openPdf(pdfPath) {
  window.open(pdfPath, '_blank');
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 显示/隐藏加载动画
function showLoading(show) {
  loading.style.display = show ? 'block' : 'none';
}

