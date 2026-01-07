/**
 * PDF翻译器前端逻辑
 */

// 全局状态
const state = {
  selectedFiles: [],
  isTranslating: false,
  currentIndex: 0,
  startTime: null,
  timerInterval: null,
  cancelRequested: false,
  authenticated: false,
  abortController: null,  // 用于中断HTTP请求
  uploadProgress: 0,      // 当前文件上传进度 (0-100)
  currentRequestId: null, // 当前翻译任务的 requestId
};

// 分页变量
let currentPage = 1;
let itemsPerPage = 20; // 历史记录默认每页20条

// DOM 元素
const elements = {
  uploadArea: document.getElementById('uploadArea'),
  fileInput: document.getElementById('fileInput'),
  fileList: document.getElementById('fileList'),
  fileItems: document.getElementById('fileItems'),
  fileCount: document.getElementById('fileCount'),
  translateCount: document.getElementById('translateCount'),
  clearFilesBtn: document.getElementById('clearFilesBtn'),
  addMoreBtn: document.getElementById('addMoreBtn'),
  startTranslationBtn: document.getElementById('startTranslationBtn'),
  progressSection: document.getElementById('progressSection'),
  progressCurrent: document.getElementById('progressCurrent'),
  progressTotal: document.getElementById('progressTotal'),
  currentFile: document.getElementById('currentFile'),
  elapsedTime: document.getElementById('elapsedTime'),
  cancelTranslationBtn: document.getElementById('cancelTranslationBtn'),
  historyCount: document.getElementById('historyCount'),
  historyTableBody: document.getElementById('historyTableBody'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  uploadProgressBar: null,  // 动态创建
  uploadProgressText: null, // 动态创建
  // 分页相关元素
  pageInfo: document.getElementById('page-info'),
  prevPageBtn: document.getElementById('prev-page'),
  nextPageBtn: document.getElementById('next-page'),
  pageJumpInput: document.getElementById('page-jump-input'),
  pageJumpBtn: document.getElementById('page-jump-btn'),
  itemsPerPageSelect: document.getElementById('items-per-page'),
};

// ============================================
// 认证相关
// ============================================

/**
 * 带认证的fetch请求包装函数
 */
async function authenticatedFetch(url, options = {}) {
  const token = window.authManager.getToken();
  
  if (!token) {
    throw new Error('未认证，请重新登录');
  }

  // 合并headers
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };

  return fetch(url, { ...options, headers });
}

// ============================================
// 工具函数
// ============================================

/**
 * 生成唯一ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化时间（秒 -> HH:MM:SS）
 */
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 格式化时长（秒 -> 1m 30s）
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * 格式化日期时间
 */
function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Toast 通知 - Linus式：自动堆叠，消除重叠
 * 使用固定高度估算，避免DOM测量不准确
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  // 先查询现有Toast数量（在添加新Toast之前）
  const existingToasts = document.querySelectorAll('.toast');
  const toastHeight = 60; // Toast固定高度估算（padding + 文字 ≈ 42-60px）
  const gap = 12;          // Toast间距
  
  // 计算新Toast的位置：起始位置 + (现有数量 × (高度 + 间距))
  const offset = 150 + (existingToasts.length * (toastHeight + gap));
  toast.style.top = offset + 'px';
  
  // 添加到DOM
  document.body.appendChild(toast);
  
  // 触发动画
  setTimeout(() => toast.classList.add('show'), 10);
  
  // 3秒后移除
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * 计算文件MD5（使用SHA-256）
 */
async function calculateFileMD5(file) {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('计算MD5失败:', error);
    return null;
  }
}

// ============================================
// 服务器端历史记录 API
// ============================================

/**
 * 获取翻译历史（从服务器）
 */
async function getHistory() {
  try {
    const response = await authenticatedFetch('/api/translate/history');
    const data = await response.json();
    
    if (data.success) {
      return data.history || [];
    } else {
      console.error('获取历史记录失败:', data.error);
      return [];
    }
  } catch (error) {
    console.error('读取历史记录失败:', error);
    return [];
  }
}

/**
 * 保存翻译历史（到服务器）
 */
async function saveHistory(task) {
  try {
    const response = await authenticatedFetch('/api/translate/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });
    
    const data = await response.json();
    
    if (data.success) {
      await updateHistoryTable();
    } else {
      console.error('保存历史记录失败:', data.error);
    }
  } catch (error) {
    console.error('保存历史记录失败:', error);
  }
}

/**
 * 清空历史记录（服务器端）
 */
async function clearHistory() {
  if (!confirm('确定要清空所有翻译历史吗？')) {
    return;
  }
  
  try {
    const response = await authenticatedFetch('/api/translate/history', {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.success) {
      await updateHistoryTable();
    } else {
      alert('清空失败: ' + data.error);
    }
  } catch (error) {
    console.error('清空历史记录失败:', error);
    alert('清空失败: ' + error.message);
  }
}

// ============================================
// 文件选择和管理
// ============================================

/**
 * 添加文件到列表
 */
function addFiles(files) {
  const newFiles = Array.from(files).filter(file => {
    // 只接受 PDF 文件
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return false;
    }
    // 检查是否已存在
    return !state.selectedFiles.some(f => f.name === file.name && f.size === file.size);
  });

  if (newFiles.length === 0) {
    return;
  }

  state.selectedFiles.push(...newFiles);
  updateFileList();
}

/**
 * 移除文件（带动画）
 */
function removeFile(index) {
  const fileItem = elements.fileItems.children[index];
  if (fileItem) {
    fileItem.style.animation = 'fileItemSlideOut 0.3s ease';
    fileItem.addEventListener('animationend', () => {
      state.selectedFiles.splice(index, 1);
      updateFileList();
    }, { once: true });
  } else {
    state.selectedFiles.splice(index, 1);
    updateFileList();
  }
}

/**
 * 清空所有文件
 */
function clearFiles() {
  state.selectedFiles = [];
  updateFileList();
}

/**
 * 更新文件列表UI
 */
function updateFileList() {
  if (state.selectedFiles.length === 0) {
    elements.fileList.style.display = 'none';
    return;
  }

  elements.fileList.style.display = 'block';
  elements.fileCount.textContent = state.selectedFiles.length;
  elements.translateCount.textContent = state.selectedFiles.length;

  renderFileList();
}

/**
 * 渲染文件列表
 */
function renderFileList() {
  const fragment = document.createDocumentFragment();
  
  state.selectedFiles.forEach((file, index) => {
    const fileItem = createFileItem(file, index);
    fragment.appendChild(fileItem);
  });
  
  elements.fileItems.innerHTML = '';
  elements.fileItems.appendChild(fragment);
}

/**
 * 创建文件列表项
 */
function createFileItem(file, index) {
  const div = document.createElement('div');
  div.className = 'file-item';
  div.style.animation = 'fileItemSlideIn 0.3s ease';
  
  // 文件信息
  const fileInfo = document.createElement('div');
  fileInfo.className = 'file-info';
  
  const icon = createSVGIcon('file');
  fileInfo.appendChild(icon);
  
  const fileDetails = document.createElement('div');
  fileDetails.className = 'file-details';
  
  const fileName = document.createElement('span');
  fileName.className = 'file-name';
  fileName.title = file.name;
  fileName.textContent = file.name;
  fileDetails.appendChild(fileName);
  
  const fileSize = document.createElement('span');
  fileSize.className = 'file-size';
  fileSize.textContent = formatFileSize(file.size);
  fileDetails.appendChild(fileSize);
  
  fileInfo.appendChild(fileDetails);
  div.appendChild(fileInfo);
  
  // 移除按钮
  const removeBtn = document.createElement('button');
  removeBtn.className = 'file-remove';
  removeBtn.dataset.index = index;
  removeBtn.setAttribute('aria-label', '移除文件');
  removeBtn.appendChild(createSVGIcon('close'));
  
  div.appendChild(removeBtn);
  
  return div;
}

/**
 * 创建 SVG 图标
 */
function createSVGIcon(type) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  
  if (type === 'file') {
    svg.setAttribute('class', 'file-icon');
    svg.innerHTML = `
      <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14 2V8H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M16 13H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M16 17H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 9H9H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  } else if (type === 'close') {
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.innerHTML = `
      <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  } else if (type === 'empty') {
    svg.setAttribute('class', 'empty-history-icon');
    svg.innerHTML = `
      <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14 2V8H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  
  return svg;
}

/**
 * 初始化文件列表事件（只调用一次）
 */
function initFileListEvents() {
  elements.fileItems.addEventListener('click', (e) => {
    const btn = e.target.closest('.file-remove');
    if (!btn) return;
    
    const index = parseInt(btn.dataset.index);
    removeFile(index);
  });
}

// ============================================
// 文件上传事件
// ============================================

/**
 * 初始化文件上传相关事件
 */
function initUploadEvents() {
  // 点击上传区域
  elements.uploadArea.addEventListener('click', () => {
    if (!state.isTranslating) {
      elements.fileInput.click();
    }
  });

  // 文件选择
  elements.fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = ''; // 清空，允许重复选择同一文件
  });

  // 拖拽上传
  elements.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.add('dragging');
  });

  elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.classList.remove('dragging');
  });

  elements.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragging');
    
    if (!state.isTranslating) {
      addFiles(e.dataTransfer.files);
    }
  });

  // 按钮事件
  elements.clearFilesBtn.addEventListener('click', clearFiles);
  elements.addMoreBtn.addEventListener('click', () => {
    elements.fileInput.click();
  });
}

// ============================================
// 翻译功能
// ============================================

/**
 * 开始翻译
 */
async function startTranslation() {
  if (state.selectedFiles.length === 0) {
    showToast('请先选择要翻译的PDF文件', 'warning');
    return;
  }

  if (state.isTranslating) {
    return;
  }

  state.isTranslating = true;
  state.currentIndex = 0;
  state.startTime = Date.now();
  state.cancelRequested = false;
  state.abortController = new AbortController();  // 创建新的中断控制器

  // 显示进度区域
  elements.progressSection.classList.add('show');
  elements.progressTotal.textContent = state.selectedFiles.length;
  
  // 创建上传进度条
  createUploadProgressBar();
  
  // 禁用上传区域
  elements.uploadArea.style.opacity = '0.5';
  elements.uploadArea.style.pointerEvents = 'none';
  elements.startTranslationBtn.disabled = true;

  // 启动计时器
  startTimer();

  // 统计结果
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,  // 跳过的（已翻译过的）
  };

  // 逐个翻译
  for (let i = 0; i < state.selectedFiles.length; i++) {
    // 检查是否取消 - 关键修复：在每次循环开始时检查
    if (state.cancelRequested) {
      showToast('翻译已取消', 'info');
      break;
    }

    state.currentIndex = i;
    const file = state.selectedFiles[i];
    
    // 更新UI
    elements.currentFile.textContent = file.name;
    elements.progressCurrent.textContent = i;

    // 计算文件MD5
    const md5 = await calculateFileMD5(file);
    
    // 再次检查取消状态
    if (state.cancelRequested) {
      showToast('翻译已取消', 'info');
      break;
    }
    
    // 检查是否已翻译过
    if (md5) {
      const history = await getHistory();
      const existingTask = history.find(t => t.md5 === md5 && t.status === 'success');
      
      if (existingTask) {
        // 已翻译过，跳过
        showToast(`文件 "${file.name}" 已翻译过，已跳过`, 'info');
        results.skipped++;
        elements.progressCurrent.textContent = i + 1;
        continue;
      }
    }

    // 翻译文件
    const result = await translateFile(file, md5);
    
    // 检查取消状态
    if (state.cancelRequested) {
      showToast('翻译已取消', 'info');
      break;
    }
    
    if (result.success) {
      results.success++;
      showToast(`✓ ${file.name} 翻译完成`, 'success');
    } else if (result.error !== '已取消') {
      results.failed++;
      showToast(`✗ ${file.name} 翻译失败: ${result.error}`, 'error');
    }

    // 更新进度
    elements.progressCurrent.textContent = i + 1;
  }

  // 停止计时器
  stopTimer();

  // 翻译完成
  state.isTranslating = false;
  const duration = Math.floor((Date.now() - state.startTime) / 1000);

  // 隐藏进度区域
  elements.progressSection.classList.remove('show');
  removeUploadProgressBar();

  // 恢复上传区域
  elements.uploadArea.style.opacity = '1';
  elements.uploadArea.style.pointerEvents = 'auto';
  elements.startTranslationBtn.disabled = false;

  // 清空文件列表
  state.selectedFiles = [];
  updateFileList();
  
  // 显示完成通知
  if (!state.cancelRequested && results.success > 0) {
    showToast(`🎉 完成！成功 ${results.success} 个${results.failed > 0 ? `，失败 ${results.failed} 个` : ''}`, 'success');
  }
  
  // 滚动到历史记录，让用户看到新添加的记录
  setTimeout(() => {
    document.querySelector('.history-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

/**
 * 翻译单个文件（使用XMLHttpRequest支持上传进度）
 */
async function translateFile(file, md5 = null) {
  const taskId = generateId();
  const task = {
    id: taskId,
    fileName: file.name,
    md5: md5,
    startTime: Date.now(),
    endTime: null,
    duration: 0,
    status: 'running',
    errorMessage: null,
    inputPath: null,
    outputPath: null,
  };

  return new Promise((resolve) => {
    // 检查是否已取消
    if (state.cancelRequested) {
      resolve({ success: false, error: '已取消' });
      return;
    }

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    
    // 生成 requestId 并发送给后端
    const requestId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    formData.append('requestId', requestId);
    state.currentRequestId = requestId;
    
    // 上传进度
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        updateUploadProgress(percentComplete);
      }
    });
    
    // 完成
    xhr.addEventListener('load', async () => {
      // 清除 requestId
      state.currentRequestId = null;
      
      if (state.cancelRequested) {
        resolve({ success: false, error: '已取消' });
        return;
      }
      
      try {
        const data = JSON.parse(xhr.responseText);
        
        if (xhr.status === 200 && data.success) {
          task.status = 'success';
          task.endTime = Date.now();
          task.duration = Math.floor((task.endTime - task.startTime) / 1000);
          task.inputPath = data.inputPath;
          task.outputPath = data.outputPath;
          
          await saveHistory(task);
          resolve({ success: true });
        } else {
          task.status = 'error';
          task.endTime = Date.now();
          task.duration = Math.floor((task.endTime - task.startTime) / 1000);
          task.errorMessage = data.error || '翻译失败';
          
          await saveHistory(task);
          resolve({ success: false, error: task.errorMessage });
        }
      } catch (error) {
        task.status = 'error';
        task.endTime = Date.now();
        task.duration = Math.floor((task.endTime - task.startTime) / 1000);
        task.errorMessage = '解析响应失败';
        
        await saveHistory(task);
        resolve({ success: false, error: task.errorMessage });
      }
    });
    
    // 错误
    xhr.addEventListener('error', async () => {
      if (state.cancelRequested) {
        resolve({ success: false, error: '已取消' });
        return;
      }
      
      task.status = 'error';
      task.endTime = Date.now();
      task.duration = Math.floor((task.endTime - task.startTime) / 1000);
      task.errorMessage = '网络错误';
      
      await saveHistory(task);
      resolve({ success: false, error: task.errorMessage });
    });
    
    // 取消
    xhr.addEventListener('abort', () => {
      resolve({ success: false, error: '已取消' });
    });
    
    // 添加认证token
    const token = window.authManager.getToken();
    if (!token) {
      resolve({ success: false, error: '未认证' });
      return;
    }
    
    xhr.open('POST', '/api/translate');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
    
    // 监听取消请求
    if (state.abortController) {
      state.abortController.signal.addEventListener('abort', () => {
        xhr.abort();
      });
    }
  });
}

/**
 * 创建上传进度条
 */
function createUploadProgressBar() {
  // 检查是否已存在
  if (elements.uploadProgressBar) {
    return;
  }
  
  const progressContainer = document.createElement('div');
  progressContainer.className = 'upload-progress-container';
  progressContainer.innerHTML = `
    <div class="upload-progress-label">上传进度</div>
    <div class="upload-progress-bar">
      <div class="upload-progress-fill"></div>
    </div>
    <div class="upload-progress-text">0%</div>
  `;
  
  elements.progressSection.querySelector('.progress-current').appendChild(progressContainer);
  elements.uploadProgressBar = progressContainer.querySelector('.upload-progress-fill');
  elements.uploadProgressText = progressContainer.querySelector('.upload-progress-text');
}

/**
 * 更新上传进度
 */
function updateUploadProgress(percent) {
  if (elements.uploadProgressBar && elements.uploadProgressText) {
    elements.uploadProgressBar.style.width = `${percent}%`;
    elements.uploadProgressText.textContent = `${percent}%`;
    state.uploadProgress = percent;
  }
}

/**
 * 移除上传进度条
 */
function removeUploadProgressBar() {
  const container = elements.progressSection.querySelector('.upload-progress-container');
  if (container) {
    container.remove();
  }
  elements.uploadProgressBar = null;
  elements.uploadProgressText = null;
  state.uploadProgress = 0;
}

/**
 * 取消翻译
 */
async function cancelTranslation() {
  if (confirm('确定要取消当前的翻译任务吗？')) {
    state.cancelRequested = true;
    
    // 1. 先通知后端立即终止 pdf2zh_next 进程
    if (state.currentRequestId) {
      try {
        const response = await authenticatedFetch('/api/translate/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: state.currentRequestId })
        });
        
        const result = await response.json();
        if (result.success) {
          showToast('✓ 已终止翻译进程', 'success');
        } else if (response.status === 404) {
          // 文件还在上传中，后端还没开始翻译，只需 abort XHR
          showToast('已取消上传', 'info');
        } else {
          showToast('⚠️ ' + result.error, 'warning');
        }
      } catch (error) {
        console.error('取消请求失败:', error);
        // 如果后端还没记录这个任务，也算正常（文件还在上传）
        showToast('已取消操作', 'info');
      }
    }
    
    // 2. 然后中断 HTTP 连接（此时后端进程已被杀）
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }
    
    // 3. 清理状态
    state.currentRequestId = null;
    stopTimer();
    removeUploadProgressBar();
    elements.progressSection.classList.remove('show');
    elements.uploadArea.style.opacity = '1';
    elements.uploadArea.style.pointerEvents = 'auto';
    elements.startTranslationBtn.disabled = false;
    state.isTranslating = false;
  }
}

/**
 * 启动计时器
 */
function startTimer() {
  stopTimer(); // 先清除旧的
  state.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    elements.elapsedTime.textContent = formatTime(elapsed);
  }, 1000);
}

/**
 * 停止计时器
 */
function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

/**
 * 初始化翻译相关事件
 */
function initTranslationEvents() {
  elements.startTranslationBtn.addEventListener('click', startTranslation);
  elements.cancelTranslationBtn.addEventListener('click', cancelTranslation);
}

// ============================================
// 历史记录
// ============================================

/**
 * 更新历史记录表格
 */
async function updateHistoryTable() {
  const history = await getHistory();
  window.cachedHistory = history; // 缓存数据供分页使用
  renderHistoryTable(history);
}

/**
 * 渲染历史记录表格
 */
function renderHistoryTable(history) {
  elements.historyCount.textContent = history.length;
  
  if (history.length === 0) {
    renderEmptyState();
    updatePaginationUI(0); // 无数据时更新分页UI
    return;
  }
  
  renderHistoryRows(history);
}

/**
 * 渲染空状态
 */
function renderEmptyState() {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 5;
  
  const div = document.createElement('div');
  div.className = 'empty-history';
  
  div.appendChild(createSVGIcon('empty'));
  
  const p1 = document.createElement('p');
  p1.textContent = '暂无翻译记录';
  div.appendChild(p1);
  
  const p2 = document.createElement('p');
  p2.style.fontSize = '13px';
  p2.textContent = '上传PDF文件开始翻译';
  div.appendChild(p2);
  
  td.appendChild(div);
  tr.appendChild(td);
  elements.historyTableBody.innerHTML = '';
  elements.historyTableBody.appendChild(tr);
}

/**
 * 渲染历史记录行（分页）
 */
function renderHistoryRows(history) {
  const totalItems = history.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = history.slice(startIndex, endIndex);
  
  // 渲染当前页的数据
  const fragment = document.createDocumentFragment();
  currentItems.forEach(task => {
    const tr = createHistoryRow(task);
    fragment.appendChild(tr);
  });
  
  elements.historyTableBody.innerHTML = '';
  elements.historyTableBody.appendChild(fragment);
  
  // 更新分页UI
  updatePaginationUI(totalPages);
}

/**
 * 创建历史记录行
 */
function createHistoryRow(task) {
  const tr = document.createElement('tr');
  
  // 文件名
  const fileNameCell = document.createElement('td');
  fileNameCell.title = task.fileName;
  fileNameCell.textContent = task.fileName;
  tr.appendChild(fileNameCell);
  
  // 翻译时间
  const timeCell = document.createElement('td');
  timeCell.textContent = formatDateTime(task.startTime);
  tr.appendChild(timeCell);
  
  // 耗时
  const durationCell = document.createElement('td');
  durationCell.textContent = formatDuration(task.duration);
  tr.appendChild(durationCell);
  
  // 状态
  const statusCell = document.createElement('td');
  statusCell.appendChild(createStatusBadge(task.status));
  tr.appendChild(statusCell);
  
  // 操作
  const actionCell = document.createElement('td');
  actionCell.appendChild(createActionButtons(task));
  tr.appendChild(actionCell);
  
  return tr;
}

/**
 * 创建状态徽章
 */
function createStatusBadge(status) {
  const span = document.createElement('span');
  span.className = `status-badge ${status === 'success' ? 'success' : 'error'}`;
  
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  span.appendChild(dot);
  
  span.appendChild(document.createTextNode(status === 'success' ? '成功' : '失败'));
  
  return span;
}

/**
 * 创建操作按钮
 */
function createActionButtons(task) {
  const div = document.createElement('div');
  div.className = 'action-buttons';
  
  // 查看原文按钮
  if (task.inputPath) {
    const viewInputBtn = createButton('查看原文', 'btn-action', {
      'data-action': 'view-input',
      'data-path': task.inputPath,
      'data-filename': task.fileName
    });
    div.appendChild(viewInputBtn);
  }
  
  // 查看译文按钮
  if (task.status === 'success' && task.outputPath) {
    const viewOutputBtn = createButton('查看译文', 'btn-action', {
      'data-action': 'view-output',
      'data-path': task.outputPath,
      'data-filename': task.fileName
    });
    div.appendChild(viewOutputBtn);
  }
  
  // 查看错误按钮
  if (task.status === 'error') {
    const viewErrorBtn = createButton('查看错误', 'btn-action btn-error', {
      'data-action': 'view-error',
      'title': task.errorMessage || '未知错误'
    });
    div.appendChild(viewErrorBtn);
  }
  
  // 删除按钮
  const deleteBtn = createButton('删除', 'btn-action btn-danger', {
    'data-action': 'delete',
    'data-id': task.id
  });
  div.appendChild(deleteBtn);
  
  return div;
}

/**
 * 创建按钮
 */
function createButton(text, className, attrs = {}) {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = text;
  
  Object.entries(attrs).forEach(([key, value]) => {
    btn.setAttribute(key, value);
  });
  
  return btn;
}

/**
 * 初始化历史记录相关事件（只调用一次）
 */
function initHistoryTableEvents() {
  elements.historyTableBody.addEventListener('click', handleHistoryTableClick);
  elements.clearHistoryBtn.addEventListener('click', clearHistory);
}

/**
 * 历史记录表格点击事件处理
 */
function handleHistoryTableClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  
  const action = btn.dataset.action;
  
  switch (action) {
    case 'view-input':
      openFile(btn.dataset.path, 'input', btn.dataset.filename);
      break;
    case 'view-output':
      openFile(btn.dataset.path, 'output', btn.dataset.filename);
      break;
    case 'view-error':
      alert(btn.title || '未知错误');
      break;
    case 'delete':
      deleteHistoryItem(btn.dataset.id);
      break;
  }
}

/**
 * 打开文件（使用原始文件名）
 */
function openFile(filePath, type, originalName) {
  if (!filePath || !originalName) {
    alert('文件路径不存在');
    return;
  }
  
  // 获取认证token
  const token = window.authManager.getToken();
  if (!token) {
    alert('未登录，请重新登录');
    return;
  }
  
  // 构建新的下载URL，使用原始文件名并附带token
  const params = new URLSearchParams({
    path: filePath,
    type: type,
    originalName: originalName,
    token: token  // 在URL中附带token
  });
  
  const downloadUrl = `/api/translate/download?${params.toString()}`;
  
  // 打开新窗口查看文件
  window.open(downloadUrl, '_blank');
}

/**
 * 删除单条历史记录
 */
async function deleteHistoryItem(taskId) {
  if (!confirm('确定删除此记录吗？相关文件也会被删除。')) {
    return;
  }

  try {
    const history = await getHistory();
    const task = history.find(t => t.id === taskId);
    
    if (!task) {
      alert('记录不存在');
      return;
    }

    // 删除文件
    const deleteFileResponse = await authenticatedFetch('/api/translate/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputPath: task.inputPath,
        outputPath: task.outputPath
      })
    });

    const fileResult = await deleteFileResponse.json();

    // 删除历史记录
    const deleteHistoryResponse = await authenticatedFetch(`/api/translate/history/${taskId}`, {
      method: 'DELETE'
    });

    const historyResult = await deleteHistoryResponse.json();
    
    if (historyResult.success) {
      await updateHistoryTable();
    } else {
      alert('删除失败: ' + historyResult.error);
    }
  } catch (error) {
    console.error('删除失败:', error);
    alert('删除失败: ' + error.message);
  }
}

// ============================================
// 初始化
// ============================================

/**
 * 显示用户信息
 */
function showUserInfo() {
  const employeeId = window.authManager.getEmployeeId();
  const name = window.authManager.getName();
  
  if (employeeId && name) {
    document.getElementById('userEmployeeId').textContent = employeeId;
    document.getElementById('userName').textContent = name;
    document.getElementById('userInfo').style.display = 'flex';
  }
}

/**
 * 登出
 */
function logout() {
  if (confirm('确定要退出登录吗？')) {
    window.authManager.logout();
  }
}

/**
 * 初始化键盘快捷键
 */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + V - 粘贴文件
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !state.isTranslating) {
      // 检查是否在输入框中
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      
      // 触发文件选择
      setTimeout(() => {
        navigator.clipboard.read?.().then(items => {
          for (const item of items) {
            for (const type of item.types) {
              if (type.startsWith('image/') || type === 'application/pdf') {
                item.getType(type).then(blob => {
                  const file = new File([blob], 'pasted.pdf', { type: blob.type });
                  addFiles([file]);
                  showToast('已从剪贴板添加文件', 'success');
                });
              }
            }
          }
        }).catch(() => {
          // 如果剪贴板API不可用，提示用户
          showToast('请使用文件选择或拖拽上传', 'info');
        });
      }, 0);
    }
    
    // Ctrl/Cmd + Enter - 开始翻译
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !state.isTranslating) {
      if (state.selectedFiles.length > 0) {
        e.preventDefault();
        startTranslation();
      }
    }
    
    // Esc - 取消翻译
    if (e.key === 'Escape' && state.isTranslating) {
      e.preventDefault();
      cancelTranslation();
    }
  });
}

// ============================================
// 分页功能
// ============================================

/**
 * 更新分页UI状态
 */
function updatePaginationUI(totalPages) {
  if (!elements.pageInfo || !elements.prevPageBtn || !elements.nextPageBtn) {
    return; // 如果分页元素不存在，直接返回
  }
  
  if (totalPages === 0) {
    elements.pageInfo.textContent = '第 0 页，共 0 页';
    elements.prevPageBtn.disabled = true;
    elements.nextPageBtn.disabled = true;
    if (elements.pageJumpInput) {
      elements.pageJumpInput.value = 1;
      elements.pageJumpInput.max = 1;
    }
    return;
  }
  
  elements.pageInfo.textContent = `第 ${currentPage} 页，共 ${totalPages} 页`;
  elements.prevPageBtn.disabled = currentPage <= 1;
  elements.nextPageBtn.disabled = currentPage >= totalPages;
  
  if (elements.pageJumpInput) {
    elements.pageJumpInput.value = currentPage;
    elements.pageJumpInput.max = totalPages;
  }
}

/**
 * 切换页面
 */
function changePage(direction) {
  const history = window.cachedHistory || [];
  const totalPages = Math.ceil(history.length / itemsPerPage);
  const newPage = currentPage + direction;
  
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    renderHistoryTable(history);
  }
}

/**
 * 跳转到指定页面
 */
function jumpToPage() {
  if (!elements.pageJumpInput) return;
  
  const history = window.cachedHistory || [];
  const totalPages = Math.ceil(history.length / itemsPerPage);
  const targetPage = parseInt(elements.pageJumpInput.value, 10);
  
  if (isNaN(targetPage) || targetPage < 1 || targetPage > totalPages) {
    showToast(`请输入有效的页码（1-${totalPages}）`, 'error');
    elements.pageJumpInput.value = currentPage;
    return;
  }
  
  if (targetPage === currentPage) {
    return;
  }
  
  currentPage = targetPage;
  renderHistoryTable(history);
}

/**
 * 改变每页显示条数
 */
function changeItemsPerPage() {
  if (!elements.itemsPerPageSelect) return;
  
  const newItemsPerPage = parseInt(elements.itemsPerPageSelect.value, 10);
  if (isNaN(newItemsPerPage) || newItemsPerPage <= 0) return;
  
  // 计算改变行数后，当前数据应该在第几页
  const history = window.cachedHistory || [];
  const currentFirstItemIndex = (currentPage - 1) * itemsPerPage;
  
  itemsPerPage = newItemsPerPage;
  
  // 计算新的页码
  currentPage = Math.floor(currentFirstItemIndex / itemsPerPage) + 1;
  const totalPages = Math.ceil(history.length / itemsPerPage);
  currentPage = Math.max(1, Math.min(currentPage, totalPages));
  
  renderHistoryTable(history);
}

/**
 * 绑定分页事件
 */
function bindPaginationEvents() {
  if (elements.prevPageBtn) {
    elements.prevPageBtn.addEventListener('click', () => changePage(-1));
  }
  
  if (elements.nextPageBtn) {
    elements.nextPageBtn.addEventListener('click', () => changePage(1));
  }
  
  if (elements.pageJumpBtn) {
    elements.pageJumpBtn.addEventListener('click', jumpToPage);
  }
  
  if (elements.pageJumpInput) {
    elements.pageJumpInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        jumpToPage();
      }
    });
  }
  
  if (elements.itemsPerPageSelect) {
    elements.itemsPerPageSelect.addEventListener('change', changeItemsPerPage);
  }
}

async function init() {
  try {
    // 检查认证
    const authenticated = await window.authManager.init();
    
    if (!authenticated) {
      // 未认证，显示登录对话框
      await window.authManager.showAuthDialog();
    }
    
    state.authenticated = true;
    
    // 显示用户信息
    showUserInfo();
    
    // 绑定登出按钮
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', logout);
    }
    
    // 初始化所有事件监听（只调用一次）
    initUploadEvents();
    initFileListEvents();
    initTranslationEvents();
    initHistoryTableEvents();
    initKeyboardShortcuts();
    bindPaginationEvents(); // 绑定分页事件
    
    // 加载历史记录
    await updateHistoryTable();
    
    showToast('👋 欢迎使用PDF翻译器！', 'info');
    
  } catch (error) {
    console.error('初始化失败:', error);
    showToast('初始化失败: ' + error.message, 'error');
  }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

