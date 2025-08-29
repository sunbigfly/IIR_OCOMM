@echo off
REM IIR OCOMM 非活性成分数据检索系统 - Windows WSL 部署脚本
REM 此脚本在Windows中调用WSL环境进行部署

setlocal enabledelayedexpansion

REM 配置
set PROJECT_NAME=IIR_OCOMM
set WSL_DISTRO=Ubuntu
set DEFAULT_PORT=8000

REM 颜色定义 (Windows 10+)
set "RED=[91m"
set "GREEN=[92m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "NC=[0m"

REM 日志函数
:log_info
echo %BLUE%[INFO]%NC% %~1
goto :eof

:log_success
echo %GREEN%[SUCCESS]%NC% %~1
goto :eof

:log_warning
echo %YELLOW%[WARNING]%NC% %~1
goto :eof

:log_error
echo %RED%[ERROR]%NC% %~1
goto :eof

REM 显示帮助信息
:show_help
echo IIR OCOMM 部署脚本 - Windows WSL环境
echo.
echo 用法: %~nx0 [选项]
echo.
echo 选项:
echo   -h, --help     显示此帮助信息
echo   -p, --port     指定端口号 (默认: 8000)
echo   -d, --dev      开发模式 (自动重启)
echo   -b, --build    仅构建，不启动服务
echo   -s, --start    仅启动服务，不重新构建
echo   -c, --clean    清理构建文件
echo   --nginx        使用Nginx部署
echo   --apache       使用Apache部署
echo   --daemon       后台运行模式
echo   --stop         停止后台服务
echo   --status       查看服务状态
echo   --logs         查看服务日志
echo   --network      配置局域网访问
echo   --firewall     配置防火墙规则
echo   -n             开启局域网访问
echo   --wsl-setup    设置WSL环境
echo.
echo 示例:
echo   %~nx0                    # 完整部署并启动
echo   %~nx0 -p 3000           # 在端口3000启动
echo   %~nx0 -d                # 开发模式
echo   %~nx0 --nginx           # 使用Nginx部署
echo   %~nx0 --wsl-setup       # 设置WSL环境
goto :eof

REM 检查WSL是否可用
:check_wsl
call :log_info "检查WSL环境..."

wsl --list --quiet >nul 2>&1
if %errorlevel% neq 0 (
    call :log_error "WSL未安装或未启用"
    call :log_info "请参考微软官方文档安装WSL: https://docs.microsoft.com/zh-cn/windows/wsl/install"
    exit /b 1
)

wsl --distribution %WSL_DISTRO% --exec echo "WSL连接测试" >nul 2>&1
if %errorlevel% neq 0 (
    call :log_warning "默认WSL发行版 %WSL_DISTRO% 不可用，尝试使用默认发行版"
    set WSL_DISTRO=
)

call :log_success "WSL环境检查通过"
goto :eof

REM 设置WSL环境
:setup_wsl
call :log_info "设置WSL环境..."

REM 更新包管理器
call :log_info "更新包管理器..."
if defined WSL_DISTRO (
    wsl --distribution %WSL_DISTRO% --exec sudo apt update
) else (
    wsl --exec sudo apt update
)

REM 安装必要的包
call :log_info "安装必要的包..."
if defined WSL_DISTRO (
    wsl --distribution %WSL_DISTRO% --exec sudo apt install -y python3 python3-pip curl wget git
) else (
    wsl --exec sudo apt install -y python3 python3-pip curl wget git
)

call :log_success "WSL环境设置完成"
goto :eof

REM 获取WSL IP地址
:get_wsl_ip
if defined WSL_DISTRO (
    for /f "tokens=*" %%i in ('wsl --distribution %WSL_DISTRO% --exec hostname -I') do set WSL_IP=%%i
) else (
    for /f "tokens=*" %%i in ('wsl --exec hostname -I') do set WSL_IP=%%i
)
set WSL_IP=%WSL_IP: =%
goto :eof

REM 打开浏览器
:open_browser
set url=%~1
call :log_info "正在打开浏览器..."
start "" "%url%"
goto :eof

REM 显示访问信息
:show_access_info
set port=%~1
call :get_wsl_ip

echo.
echo ================================
echo   部署完成！访问信息:
echo ================================
echo.
echo 本地访问:
echo   http://localhost:%port%
echo.
echo WSL访问:
echo   http://%WSL_IP%:%port%
echo.
echo 网络访问 (如果防火墙允许):
echo   http://[你的IP地址]:%port%
echo.
echo 按任意键打开浏览器...
pause >nul
call :open_browser "http://localhost:%port%"
goto :eof

REM 主函数
:main
set port=%DEFAULT_PORT%
set wsl_args=

REM 解析命令行参数
:parse_args
if "%~1"=="" goto :end_parse
if "%~1"=="-h" goto :help
if "%~1"=="--help" goto :help
if "%~1"=="-p" (
    set port=%~2
    shift
    shift
    goto :parse_args
)
if "%~1"=="--port" (
    set port=%~2
    shift
    shift
    goto :parse_args
)
if "%~1"=="--wsl-setup" (
    call :setup_wsl
    exit /b 0
)

REM 其他参数直接传递给WSL脚本
set wsl_args=%wsl_args% %~1
shift
goto :parse_args

:help
call :show_help
exit /b 0

:end_parse

REM 显示欢迎信息
echo ==========================================
echo   IIR OCOMM 部署脚本 - Windows WSL环境
echo ==========================================
echo.

REM 检查WSL
call :check_wsl
if %errorlevel% neq 0 exit /b 1

REM 检查项目文件
if not exist "deploy.sh" (
    call :log_error "deploy.sh 脚本不存在"
    exit /b 1
)

REM 给脚本添加执行权限
call :log_info "设置脚本权限..."
if defined WSL_DISTRO (
    wsl --distribution %WSL_DISTRO% --exec chmod +x deploy.sh
) else (
    wsl --exec chmod +x deploy.sh
)

REM 执行WSL部署脚本
call :log_info "执行部署脚本..."
if defined WSL_DISTRO (
    wsl --distribution %WSL_DISTRO% --exec ./deploy.sh %wsl_args%
) else (
    wsl --exec ./deploy.sh %wsl_args%
)

REM 检查是否是开发服务器模式
echo %wsl_args% | findstr /C:"nginx" >nul
if %errorlevel% equ 0 goto :nginx_deployed

echo %wsl_args% | findstr /C:"apache" >nul
if %errorlevel% equ 0 goto :apache_deployed

echo %wsl_args% | findstr /C:"-b" >nul
if %errorlevel% equ 0 goto :build_only

echo %wsl_args% | findstr /C:"--build" >nul
if %errorlevel% equ 0 goto :build_only

echo %wsl_args% | findstr /C:"-c" >nul
if %errorlevel% equ 0 goto :clean_only

echo %wsl_args% | findstr /C:"--clean" >nul
if %errorlevel% equ 0 goto :clean_only

REM 默认是开发服务器
call :show_access_info %port%
goto :eof

:nginx_deployed
call :log_success "Nginx部署完成!"
call :get_wsl_ip
echo.
echo 访问地址:
echo   http://localhost
echo   http://%WSL_IP%
echo.
call :open_browser "http://localhost"
goto :eof

:apache_deployed
call :log_success "Apache部署完成!"
call :get_wsl_ip
echo.
echo 访问地址:
echo   http://localhost
echo   http://%WSL_IP%
echo.
call :open_browser "http://localhost"
goto :eof

:build_only
call :log_success "构建完成!"
echo 使用 %~nx0 -s 启动服务
goto :eof

:clean_only
call :log_success "清理完成!"
goto :eof

REM 程序入口
call :main %*
