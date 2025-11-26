@echo off
setlocal

REM ====== 配置：根据你的项目路径调整（如果脚本在项目根则无需改） ======
set SERVER_DIR=%~dp0server
set CLIENT_DIR=%~dp0client
set BROWSER_URL=http://localhost:3000

REM ====== 可选：初始化数据库（仅第一次运行用），取消注释下一行
REM start "" cmd /k "cd /d "%SERVER_DIR%" && npm run init-db && pause"

REM ====== 启动后端（在新窗口）
start "FilmServer" cmd /k "cd /d "%SERVER_DIR%" && echo Starting server... && npm start"

REM ====== 启动前端（在新窗口）
start "FilmClient" cmd /k "cd /d "%CLIENT_DIR%" && echo Starting client... && npm start"

REM ====== 等待短暂时间再打开浏览器（给 react-scripts 启动一点时间）
ping -n 3 127.0.0.1 > nul

REM ====== 在默认浏览器中打开页面
start "" "%BROWSER_URL%"

endlocal