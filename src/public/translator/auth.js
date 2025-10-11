/**
 * 认证模块
 * 处理用户登录、注册、重置密码等认证功能
 */

class AuthManager {
  constructor() {
    this.token = null;
    this.employeeId = null;
    this.name = null;
    this.storageKey = 'iir_ocomm_auth_token';
    this.employeeIdKey = 'iir_ocomm_employee_id';
    this.nameKey = 'iir_ocomm_name';
  }

  /**
   * 初始化认证
   * 检查本地存储的token是否有效
   */
  async init() {
    // 从localStorage读取token
    const storedToken = localStorage.getItem(this.storageKey);
    const storedEmployeeId = localStorage.getItem(this.employeeIdKey);
    const storedName = localStorage.getItem(this.nameKey);

    if (storedToken && storedEmployeeId) {
      // 验证token是否仍然有效
      try {
        const result = await this.verifyToken(storedToken);
        if (result.success) {
          this.token = storedToken;
          this.employeeId = result.employeeId;
          this.name = result.name || storedName;
          return true;
        } else {
          // token无效，清除
          this.clearAuth();
        }
      } catch (error) {
        console.error('验证token失败:', error);
        this.clearAuth();
      }
    }

    return false;
  }

  /**
   * 显示登录/注册对话框
   */
  async showAuthDialog() {
    return new Promise((resolve, reject) => {
      // 创建对话框HTML
      const dialogHTML = `
        <div class="auth-overlay" id="authOverlay">
          <div class="auth-dialog">
            <div class="auth-header">
              <h2>PDF翻译器 - 用户认证</h2>
            </div>
            <div class="auth-body">
              <form id="authForm" onsubmit="return false;">
                <div class="auth-step" id="stepEmployeeId">
                  <p class="auth-hint">请输入您的工号以继续使用</p>
                  <input type="text" id="employeeIdInput" class="auth-input" placeholder="工号 (字母/数字/下划线)" maxlength="32" autocomplete="username">
                  <button type="button" class="btn-primary auth-btn" id="checkEmployeeIdBtn">下一步</button>
                </div>

                <div class="auth-step" id="stepPassword" style="display: none;">
                  <p class="auth-hint">工号: <strong id="displayEmployeeId"></strong></p>
                  <p class="auth-hint" id="passwordHint"></p>
                  <input type="text" id="nameInput" class="auth-input" placeholder="姓名" maxlength="50" autocomplete="name" style="display: none;">
                  <input type="password" id="passwordInput" class="auth-input" placeholder="6位数字密码" maxlength="6" autocomplete="current-password">
                  <div class="auth-actions">
                    <button type="button" class="btn-secondary auth-btn" id="backBtn">返回</button>
                    <button type="button" class="btn-primary auth-btn" id="submitPasswordBtn">确认</button>
                  </div>
                  <a href="#" class="auth-link" id="forgotPasswordLink">忘记密码？</a>
                </div>

                <div class="auth-step" id="stepReset" style="display: none;">
                  <p class="auth-hint">重置密码 - 工号: <strong id="resetEmployeeId"></strong></p>
                  <p class="auth-hint warning">⚠️ 需要管理员密码才能重置</p>
                  <input type="password" id="adminPasswordInput" class="auth-input" placeholder="管理员密码" autocomplete="off">
                  <input type="password" id="newPasswordInput" class="auth-input" placeholder="新密码 (6位数字)" maxlength="6" autocomplete="new-password">
                  <div class="auth-actions">
                    <button type="button" class="btn-secondary auth-btn" id="cancelResetBtn">取消</button>
                    <button type="button" class="btn-primary auth-btn" id="submitResetBtn">重置密码</button>
                  </div>
                </div>

                <div class="auth-error" id="authError" style="display: none;"></div>
                <div class="auth-loading" id="authLoading" style="display: none;">
                  <div class="spinner"></div>
                  <span>处理中...</span>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;

      // 添加到页面
      const container = document.createElement('div');
      container.innerHTML = dialogHTML;
      document.body.appendChild(container.firstElementChild);

      // 绑定事件
      this._bindAuthDialogEvents(resolve, reject);
    });
  }

  /**
   * 绑定认证对话框事件
   */
  _bindAuthDialogEvents(resolve, reject) {
    const employeeIdInput = document.getElementById('employeeIdInput');
    const nameInput = document.getElementById('nameInput');
    const passwordInput = document.getElementById('passwordInput');
    const adminPasswordInput = document.getElementById('adminPasswordInput');
    const newPasswordInput = document.getElementById('newPasswordInput');
    
    const checkBtn = document.getElementById('checkEmployeeIdBtn');
    const submitPasswordBtn = document.getElementById('submitPasswordBtn');
    const backBtn = document.getElementById('backBtn');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const cancelResetBtn = document.getElementById('cancelResetBtn');
    const submitResetBtn = document.getElementById('submitResetBtn');

    // 检查工号
    checkBtn.addEventListener('click', async () => {
      const employeeId = employeeIdInput.value.trim();
      if (!employeeId) {
        this._showError('请输入工号');
        return;
      }

      if (!/^[A-Za-z0-9_]{1,32}$/.test(employeeId)) {
        this._showError('工号格式无效（只允许字母、数字、下划线）');
        return;
      }

      this._showLoading(true);
      try {
        const result = await this._apiCall('/api/auth/check', { employeeId });
        
        if (result.exists) {
          // 用户存在，显示登录界面
          document.getElementById('displayEmployeeId').textContent = employeeId;
          document.getElementById('passwordHint').textContent = '请输入密码:';
          nameInput.style.display = 'none';
          this._showStep('stepPassword');
          passwordInput.focus();
        } else {
          // 用户不存在，显示注册界面
          document.getElementById('displayEmployeeId').textContent = employeeId;
          document.getElementById('passwordHint').textContent = '首次使用，请输入信息:';
          nameInput.style.display = 'block';
          nameInput.value = '';
          this._showStep('stepPassword');
          nameInput.focus();
        }
      } catch (error) {
        this._showError(error.message || '检查工号失败');
      } finally {
        this._showLoading(false);
      }
    });

    // 提交密码（登录或注册）
    submitPasswordBtn.addEventListener('click', async () => {
      const employeeId = document.getElementById('displayEmployeeId').textContent;
      const name = nameInput.value.trim();
      const password = passwordInput.value.trim();

      if (!/^\d{6}$/.test(password)) {
        this._showError('密码必须是6位数字');
        return;
      }

      this._showLoading(true);
      try {
        // 先检查用户是否存在
        const checkResult = await this._apiCall('/api/auth/check', { employeeId });
        
        let result;
        if (checkResult.exists) {
          // 登录
          result = await this._apiCall('/api/auth/login', { employeeId, password });
        } else {
          // 注册
          if (!name) {
            this._showLoading(false);
            this._showError('请输入姓名');
            return;
          }
          result = await this._apiCall('/api/auth/register', { employeeId, password, name });
        }

        if (result.success) {
          this.token = result.token;
          this.employeeId = result.employeeId;
          this.name = result.name;
          this._saveAuth();
          this._closeDialog();
          resolve({ employeeId: this.employeeId, name: this.name, token: this.token });
        } else {
          this._showError(result.error || '认证失败');
        }
      } catch (error) {
        this._showError(error.message || '认证失败');
      } finally {
        this._showLoading(false);
      }
    });

    // 返回按钮
    backBtn.addEventListener('click', () => {
      passwordInput.value = '';
      nameInput.value = '';
      this._showStep('stepEmployeeId');
      employeeIdInput.focus();
    });

    // 忘记密码
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      const employeeId = document.getElementById('displayEmployeeId').textContent;
      document.getElementById('resetEmployeeId').textContent = employeeId;
      adminPasswordInput.value = '';
      newPasswordInput.value = '';
      this._showStep('stepReset');
      adminPasswordInput.focus();
    });

    // 取消重置
    cancelResetBtn.addEventListener('click', () => {
      this._showStep('stepPassword');
      passwordInput.focus();
    });

    // 提交重置
    submitResetBtn.addEventListener('click', async () => {
      const employeeId = document.getElementById('resetEmployeeId').textContent;
      const adminPassword = adminPasswordInput.value.trim();
      const newPassword = newPasswordInput.value.trim();

      if (!adminPassword) {
        this._showError('请输入管理员密码');
        return;
      }

      if (!/^\d{6}$/.test(newPassword)) {
        this._showError('新密码必须是6位数字');
        return;
      }

      this._showLoading(true);
      try {
        const result = await this._apiCall('/api/auth/reset', {
          employeeId,
          adminPassword,
          newPassword
        });

        if (result.success) {
          alert('密码重置成功！请使用新密码登录。');
          passwordInput.value = '';
          this._showStep('stepPassword');
          passwordInput.focus();
        } else {
          this._showError(result.error || '重置失败');
        }
      } catch (error) {
        this._showError(error.message || '重置失败');
      } finally {
        this._showLoading(false);
      }
    });

    // Enter键快捷操作
    employeeIdInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') checkBtn.click();
    });
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitPasswordBtn.click();
    });
    newPasswordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitResetBtn.click();
    });

    // 自动聚焦
    employeeIdInput.focus();
  }

  /**
   * 显示指定步骤
   */
  _showStep(stepId) {
    document.querySelectorAll('.auth-step').forEach(step => {
      step.style.display = 'none';
    });
    const targetStep = document.getElementById(stepId);
    if (targetStep) {
      targetStep.style.display = 'block';
    }
    this._hideError();
  }

  /**
   * 显示/隐藏加载状态
   */
  _showLoading(show) {
    const loadingEl = document.getElementById('authLoading');
    if (loadingEl) {
      loadingEl.style.display = show ? 'flex' : 'none';
    }
    // 禁用所有按钮
    document.querySelectorAll('.auth-btn').forEach(btn => {
      btn.disabled = show;
    });
  }

  /**
   * 显示错误信息
   */
  _showError(message) {
    const errorEl = document.getElementById('authError');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  /**
   * 隐藏错误信息
   */
  _hideError() {
    const errorEl = document.getElementById('authError');
    if (errorEl) {
      errorEl.style.display = 'none';
    }
  }

  /**
   * 关闭对话框
   */
  _closeDialog() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * API调用
   */
  async _apiCall(url, data) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '网络错误' }));
      throw new Error(error.error || '请求失败');
    }

    return await response.json();
  }

  /**
   * 验证token
   */
  async verifyToken(token) {
    return await this._apiCall('/api/auth/verify', { token });
  }

  /**
   * 保存认证信息到localStorage
   */
  _saveAuth() {
    localStorage.setItem(this.storageKey, this.token);
    localStorage.setItem(this.employeeIdKey, this.employeeId);
    if (this.name) {
      localStorage.setItem(this.nameKey, this.name);
    }
  }

  /**
   * 清除认证信息
   */
  clearAuth() {
    this.token = null;
    this.employeeId = null;
    this.name = null;
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.employeeIdKey);
    localStorage.removeItem(this.nameKey);
  }

  /**
   * 获取认证token（用于API请求）
   */
  getToken() {
    return this.token;
  }

  /**
   * 获取工号
   */
  getEmployeeId() {
    return this.employeeId;
  }

  /**
   * 获取姓名
   */
  getName() {
    return this.name;
  }

  /**
   * 是否已认证
   */
  isAuthenticated() {
    return !!this.token && !!this.employeeId;
  }

  /**
   * 登出
   */
  logout() {
    this.clearAuth();
    location.reload();
  }
}

// 创建全局实例
window.authManager = new AuthManager();

