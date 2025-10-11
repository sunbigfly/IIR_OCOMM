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
};

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
 * 移除文件
 */
function removeFile(index) {
  state.selectedFiles.splice(index, 1);
  updateFileList();
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

  // 渲染文件列表
  elements.fileItems.innerHTML = state.selectedFiles.map((file, index) => `
    <div class="file-item">
      <div class="file-info">
        <svg class="file-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M14 2V8H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 13H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 17H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 9H9H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="file-name" title="${file.name}">${file.name}</span>
      </div>
      <button class="file-remove" data-index="${index}" aria-label="移除文件">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `).join('');

  // 绑定移除按钮事件
  document.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      removeFile(index);
    });
  });
}

// ============================================
// 文件上传事件
// ============================================

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

// ============================================
// 翻译功能
// ============================================

/**
 * 开始翻译
 */
async function startTranslation() {
  if (state.selectedFiles.length === 0) {
    alert('请先选择要翻译的PDF文件');
    return;
  }

  if (state.isTranslating) {
    return;
  }

  state.isTranslating = true;
  state.currentIndex = 0;
  state.startTime = Date.now();
  state.cancelRequested = false;

  // 显示进度区域
  elements.progressSection.classList.add('show');
  elements.progressTotal.textContent = state.selectedFiles.length;
  
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
    if (state.cancelRequested) {
      break;
    }

    state.currentIndex = i;
    const file = state.selectedFiles[i];
    
    // 更新UI
    elements.currentFile.textContent = file.name;
    elements.progressCurrent.textContent = i;

    // 计算文件MD5
    const md5 = await calculateFileMD5(file);
    
    // 检查是否已翻译过
    if (md5) {
      const history = await getHistory();
      const existingTask = history.find(t => t.md5 === md5 && t.status === 'success');
      
      if (existingTask) {
        // 已翻译过，跳过
        console.log(`文件已翻译过，跳过: ${file.name} (原记录: ${existingTask.fileName})`);
        alert(`文件 "${file.name}" 已翻译过！\n\n原文件名: ${existingTask.fileName}\n翻译时间: ${formatDateTime(existingTask.startTime)}\n\n已自动跳过此文件。`);
        results.skipped++;
        elements.progressCurrent.textContent = i + 1;
        continue;
      }
    }

    // 翻译文件
    const result = await translateFile(file, md5);
    
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
    }

    // 更新进度
    elements.progressCurrent.textContent = i + 1;
  }

  // 停止计时器
  stopTimer();

  // 翻译完成
  state.isTranslating = false;
  const duration = Math.floor((Date.now() - state.startTime) / 1000);

  // 隐藏进度区域（不再显示总结弹窗）
  elements.progressSection.classList.remove('show');

  // 恢复上传区域
  elements.uploadArea.style.opacity = '1';
  elements.uploadArea.style.pointerEvents = 'auto';
  elements.startTranslationBtn.disabled = false;

  // 清空文件列表
  state.selectedFiles = [];
  updateFileList();
  
  // 显示简单通知（历史记录已自动更新）
  const message = `翻译完成！成功: ${results.success}, 失败: ${results.failed}${results.skipped > 0 ? ', 跳过: ' + results.skipped : ''}, 耗时: ${formatDuration(duration)}`;
  console.log(message);
  
  // 滚动到历史记录，让用户看到新添加的记录
  setTimeout(() => {
    document.querySelector('.history-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

/**
 * 翻译单个文件
 */
async function translateFile(file, md5 = null) {
  const taskId = generateId();
  const task = {
    id: taskId,
    fileName: file.name,
    md5: md5,  // 保存MD5用于去重
    startTime: Date.now(),
    endTime: null,
    duration: 0,
    status: 'running',
    errorMessage: null,
    inputPath: null,
    outputPath: null,
  };

  try {
    // 创建 FormData
    const formData = new FormData();
    formData.append('file', file);

    // 发送翻译请求
    const response = await authenticatedFetch('/api/translate', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // 翻译成功
      task.status = 'success';
      task.endTime = Date.now();
      task.duration = Math.floor((task.endTime - task.startTime) / 1000);
      task.inputPath = data.inputPath;
      task.outputPath = data.outputPath;
      
      saveHistory(task);
      return { success: true };
    } else {
      // 翻译失败
      task.status = 'error';
      task.endTime = Date.now();
      task.duration = Math.floor((task.endTime - task.startTime) / 1000);
      task.errorMessage = data.error || '翻译失败';
      
      saveHistory(task);
      return { success: false, error: task.errorMessage };
    }
  } catch (error) {
    // 网络错误或其他异常
    task.status = 'error';
    task.endTime = Date.now();
    task.duration = Math.floor((task.endTime - task.startTime) / 1000);
    task.errorMessage = error.message || '网络错误';
    
    saveHistory(task);
    return { success: false, error: task.errorMessage };
  }
}

/**
 * 取消翻译
 */
function cancelTranslation() {
  if (confirm('确定要取消当前的翻译任务吗？')) {
    state.cancelRequested = true;
    stopTimer();
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

// 翻译按钮事件
elements.startTranslationBtn.addEventListener('click', startTranslation);
elements.cancelTranslationBtn.addEventListener('click', cancelTranslation);

// ============================================
// 历史记录
// ============================================

/**
 * 更新历史记录表格（异步调度，避免阻塞主线程）
 */
let updateHistoryTablePending = false;
async function updateHistoryTable() {
  // 防抖：如果已经有待处理的更新，跳过
  if (updateHistoryTablePending) {
    return;
  }
  
  updateHistoryTablePending = true;
  
  // 使用 requestIdleCallback 在浏览器空闲时更新，避免阻塞主线程
  const updateTask = async () => {
    try {
      const history = await getHistory();
      elements.historyCount.textContent = history.length;

      if (history.length === 0) {
        elements.historyTableBody.innerHTML = `
          <tr>
            <td colspan="5">
              <div class="empty-history">
                <svg class="empty-history-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M14 2V8H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <p>暂无翻译记录</p>
                <p style="font-size: 13px;">上传PDF文件开始翻译</p>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      // 使用 DocumentFragment 减少重排
      const fragment = document.createDocumentFragment();
      const tbody = document.createElement('tbody');
      
      // 分批渲染，每批50条，避免一次性处理太多
      const BATCH_SIZE = 50;
      for (let i = 0; i < history.length; i += BATCH_SIZE) {
        const batch = history.slice(i, i + BATCH_SIZE);
        
        batch.forEach(task => {
          const tr = document.createElement('tr');
          const statusClass = task.status === 'success' ? 'success' : 'error';
          const statusText = task.status === 'success' ? '成功' : '失败';
          
          tr.innerHTML = `
            <td title="${task.fileName}">${task.fileName}</td>
            <td>${formatDateTime(task.startTime)}</td>
            <td>${formatDuration(task.duration)}</td>
            <td>
              <span class="status-badge ${statusClass}">
                <span class="status-dot"></span>
                ${statusText}
              </span>
            </td>
            <td>
              <div class="action-buttons">
                ${task.inputPath ? `
                  <button class="btn-action" data-action="view-input" data-path="${task.inputPath}">查看原文</button>
                ` : ''}
                ${task.status === 'success' && task.outputPath ? `
                  <button class="btn-action" data-action="view-output" data-path="${task.outputPath}">查看译文</button>
                ` : ''}
                ${task.status === 'error' ? `
                  <button class="btn-action btn-error" data-action="view-error" title="${task.errorMessage || '未知错误'}">查看错误</button>
                ` : ''}
                <button class="btn-action btn-danger" data-action="delete" data-id="${task.id}">删除</button>
              </div>
            </td>
          `;
          
          tbody.appendChild(tr);
        });
        
        // 分批时让出主线程
        if (i + BATCH_SIZE < history.length) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      
      // 一次性替换整个tbody（减少重排次数）
      elements.historyTableBody.innerHTML = '';
      elements.historyTableBody.appendChild(tbody);
      
      // 使用事件委托，不再用 onclick
      bindHistoryTableEvents();
      
    } finally {
      updateHistoryTablePending = false;
    }
  };
  
  // 优先使用 requestIdleCallback，降级到 setTimeout
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => updateTask(), { timeout: 1000 });
  } else {
    setTimeout(() => updateTask(), 0);
  }
}

/**
 * 绑定历史记录表格事件（事件委托，性能更好）
 */
function bindHistoryTableEvents() {
  // 移除旧的监听器（如果有）
  elements.historyTableBody.removeEventListener('click', handleHistoryTableClick);
  
  // 添加新的监听器
  elements.historyTableBody.addEventListener('click', handleHistoryTableClick);
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
    case 'view-output':
      openFile(btn.dataset.path);
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
 * 打开文件
 */
function openFile(filePath) {
  if (!filePath) {
    alert('文件路径不存在');
    return;
  }
  
  // 在新窗口打开文件
  window.open(filePath, '_blank');
}

/**
 * 删除单条历史记录
 */
async function deleteHistoryItem(taskId) {
  if (!confirm('确定删除此记录吗？相关文件也会被删除。')) {
    return;
  }

  try {
    // 获取任务信息
    const history = await getHistory();
    const task = history.find(t => t.id === taskId);
    
    if (!task) {
      alert('记录不存在');
      return;
    }

    // 调用后端删除文件
    const deleteFileResponse = await authenticatedFetch('/api/translate/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputPath: task.inputPath,
        outputPath: task.outputPath
      })
    });

    const fileResult = await deleteFileResponse.json();
    
    if (!fileResult.success) {
      console.warn('删除文件失败:', fileResult.error);
    }

    // 从服务器删除历史记录
    const deleteHistoryResponse = await authenticatedFetch(`/api/translate/history/${taskId}`, {
      method: 'DELETE'
    });

    const historyResult = await deleteHistoryResponse.json();
    
    if (historyResult.success) {
      // 更新UI
      await updateHistoryTable();
    } else {
      alert('删除记录失败: ' + historyResult.error);
    }
    
  } catch (error) {
    console.error('删除失败:', error);
    alert('删除失败: ' + error.message);
  }
}

// 清空历史按钮
elements.clearHistoryBtn.addEventListener('click', clearHistory);

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
    
    // 显示当前用户
    const employeeId = window.authManager.getEmployeeId();
    const name = window.authManager.getName();
    console.log('PDF翻译器已初始化 - 用户:', employeeId, name);
    
    // 加载历史记录
    await updateHistoryTable();
    
  } catch (error) {
    console.error('初始化失败:', error);
    alert('初始化失败: ' + error.message);
  }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

