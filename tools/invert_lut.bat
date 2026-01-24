@echo off
REM 3D LUT Inverter 批处理文件
REM 使用Anaconda Python环境运行脚本

set ANACONDA_PYTHON=C:\Users\junlonghuang\anaconda3\python.exe
set SCRIPT_PATH=%~dp0invert_3d_lut.py

%ANACONDA_PYTHON% %SCRIPT_PATH% %*

pause