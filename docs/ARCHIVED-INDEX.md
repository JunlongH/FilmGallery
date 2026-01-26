# 文档归档索引 (Archived Documentation Index)

> 最后更新: 2025年底  
> 此文件记录了 docs/ 文件夹中应该整理到 `archived/` 文件夹的历史文档

## 📋 归档说明

以下文档已过时或已集成到新的文档体系中。为保持 `/docs` 文件夹整洁，这些文件应该被移动到 `archived/` 文件夹保存，同时保留 Git 历史记录。

---

## 📂 需要归档的文件列表

### 1️⃣ 功能规划文档 (Feature Plans - 16 files)
这些是已实现或已计划的功能设计文档。实现内容已集成到代码中，规划文档作为历史参考保留。

```
auto-edge-detection-and-raw-decode-plan.md       - 边缘检测和原始图像解码规划
batch-edit-improvements-plan.md                  - 批量编辑改进规划
batch-export-implementation-2026-01-16.md        - 批量导出实现计划
batch-export-system-plan.md                      - 批量导出系统规划
dynamic-port-discovery-plan.md                   - 动态端口发现规划
filmlab-feature-implementation-plan.md           - FilmLab功能实现规划
filmlab-optimization-plan.md                     - FilmLab优化规划
filmlab-pipeline-analysis.md                     - FilmLab管道分析
filmlab-pipeline-unification-2026-01-16.md       - FilmLab管道统一规划
frontend-upload-modal-plan.md                    - 前端上传对话框规划
frontend-upload-refactor-2026-01-17.md           - 前端上传重构规划
log-domain-film-processing-plan.md               - 日志域电影处理规划
photo-map-feature-plan.md                        - 照片地图功能规划
shot-log-location-fix-plan.md                    - 拍摄日志位置修复规划
shot-log-mapper-plan.md                          - 拍摄日志映射规划
upload-workflow-optimization-plan.md             - 上传工作流优化规划
```

**处理方式**: 移动到 `archived/planning/`  
**保留原因**: Git 历史记录和功能演变跟踪  
**何时查看**: 理解功能决策历史时参考

---

### 2️⃣ 缺陷修复记录 (Bug Fix Records - 9 files)
这些是已解决的bug的记录文档。修复已集成到代码中。

```
bugfix-2025-01-07-remote-api-base.md                         - 远程API基础修复
bugfix-2025-12-02-filmlab-export.md                          - FilmLab导出修复
bugfix-2025-12-02-production-mode.md                         - 生产模式修复
bugfix-2025-12-04-gpu-export-wb.md                           - GPU导出白平衡修复
bugfix-2025-12-04-webgl-crop-overlay.md                      - WebGL裁剪覆盖层修复
bugfix-2025-12-10-exposure-fallback.md                       - 曝光回退修复
bugfix-2026-01-04-onedrive-tif-upload.md                     - OneDrive TIF上传修复
bugfix-2026-01-25-mobile-camera-loading-and-focal-length.md  - 移动相机加载和焦距修复
bugfix-2026-01-26-gpu-export-remote-api.md                   - GPU导出远程API修复
```

**处理方式**: 移动到 `archived/bugfixes/`  
**保留原因**: Git 历史记录和问题解决追踪  
**何时查看**: 调查类似bug的历史解决方案

---

### 3️⃣ 数据库迁移文档 (Database Migration - 2 files)
数据库架构演变记录。当前架构已在 `dev-manual/02-database.md` 中完全文档化。

```
schema-migration-2025-12-01.md                   - 架构迁移 2025-12-01
schema-migration-2026-01-12-lens-camera-specs.md - 镜头/相机规格架构迁移
database-migration-2025-11-30.md                 - 数据库迁移 2025-11-30
```

**处理方式**: 移动到 `archived/database-history/`  
**保留原因**: 数据库演变的历史记录  
**何时查看**: 追踪架构决策，维护数据库升级脚本

---

### 4️⃣ 优化和分析报告 (Optimization & Analysis - 7 files)
完成的分析和优化工作报告。

```
CODE-OPTIMIZATION-PLAN.md                  - 代码优化计划
OPTIMIZATION_REPORT.md                     - 优化报告
prepared-statements.md                     - 预提交语句分析
camera-lens-data-consistency-fix-2026-01-24.md    - 相机镜头数据一致性修复
equipment-management-update-2025-01-15.md        - 设备管理更新
film-base-correction-fix-2026-01-18.md           - 胶片基础校正修复
film-base-correction-math-analysis.md            - 胶片基础校正数学分析
film-format-system-2026-01-17.md                 - 胶片格式系统
```

**处理方式**: 移动到 `archived/analysis/`  
**保留原因**: 优化决策和技术分析的历史记录  
**何时查看**: 性能优化、数据一致性问题

---

### 5️⃣ 临时注记和其他 (Temporary Notes - 6 files)
临时性的问题记录和网络诊断文档。

```
GET-IP-ADDRESS.md                              - IP地址获取临时注记
RELEASE-MODE-NETWORK-AUDIT.md                  - 发布模式网络审计
libraw-native-integration-plan.md               - LibRaw原生集成规划
location-service-system-fix-2026-01-13.md       - 位置服务系统修复
panasonic-s9-rw2-support-issue-2026-01-24.md   - Panasonic S9 RW2支持问题
scanner-exif-and-format-support-plan.md        - 扫描仪EXIF和格式支持规划
```

**处理方式**: 移动到 `archived/temporary/`  
**保留原因**: 问题追踪和诊断历史  
**何时查看**: 类似问题排查时参考

---

### 6️⃣ 其他遗留文档 (Legacy - 6 files)
```
db-revamp.md                               - 数据库重设计 (已集成到dev-manual)
filmlab-minimal-changes-done.md            - FilmLab最小化更改记录
database-migration-2025-11-30.md           - 数据库迁移历史记录 (已集成到dev-manual/02-database.md)
libraw-native-integration-plan.md          - LibRaw集成规划 (已有guide版本)
location-service-system-fix-2026-01-13.md  - 位置服务修复记录 (已完成)
watch-app-summary.md                       - 手表应用总结 (与WATCH-APP-DEVELOPMENT.md重复)
```

**处理方式**: 移动到 `archived/legacy/`

---

## 📊 整理统计

| 分类 | 数量 | 状态 |
|------|------|------|
| 功能规划 (Planning) | 16 | ✅ 已归档 |
| 缺陷修复 (Bug Fixes) | 9 | ✅ 已归档 |
| 数据库历史 (DB History) | 3 | ✅ 已归档 |
| 分析报告 (Analysis) | 8 | ✅ 已归档 |
| 临时注记 (Temporary) | 5 | ✅ 已归档 |
| 遗留文档 (Legacy) | 6 | ✅ 已归档 |
| **总计已归档** | **47** | ✅ 完成 |

> 说明: 两轮清理共移动45个文件到archived文件夹

---

## 📝 保留在 docs/ 中的核心文档

### 主要文档
```
DEVELOPER-MANUAL.md                    ✅ 开发者手册 - 主索引
ARCHIVED-INDEX.md                      ✅ 本文档 - 归档索引
```

### 详细章节 (在 dev-manual/ 文件夹中)
```
dev-manual/
  ├── 01-architecture.md               - 系统架构
  ├── 02-database.md                   - 数据库设计
  ├── 03-backend-api.md                - 后端API参考
  ├── 04-frontend.md                   - 前端开发指南
  ├── 05-core-features.md              - 核心功能深度
  ├── 06-development.md                - 开发工作流
  └── 07-deployment.md                 - 部署和运维
```

### 快速参考文档 (专题指南)
```
API_BASE-QUICK-REFERENCE.md            ✅ API基础快速参考 - 远程连接配置
DOCKER-BUILD-GUIDE.md                  ✅ Docker构建和部署指南
WATCH-APP-DEVELOPMENT.md               ✅ Wear OS手表应用开发完整指南
RAW-DECODE-SETUP.md                    ✅ RAW文件解码配置和LibRaw集成
onedrive-sync-optimization.md          ✅ OneDrive同步性能优化
libraw-native-integration-guide.md     ✅ LibRaw原生集成实现指南
hybrid-compute-architecture.md         ✅ 混合计算架构（客户端+服务器GPU）
```

**总计保留**: 11 个核心文档（1个主手册 + 7个详细章节 + 1个索引 + 8个快速参考）

---

## 🗂️ 建议的文件夹结构

```
docs/
├── DEVELOPER-MANUAL.md                 # 主索引
├── ARCHIVED-INDEX.md                   # 归档索引（本文件）
├── dev-manual/                         # 详细章节
│   ├── 01-architecture.md
│   ├── 02-database.md
│   ├── 03-backend-api.md
│   ├── 04-frontend.md
│   ├── 05-core-features.md
│   ├── 06-development.md
│   └── 07-deployment.md
├── API_BASE-QUICK-REFERENCE.md         # 快速参考：远程连接配置
├── DOCKER-BUILD-GUIDE.md               # 快速参考：Docker部署
├── WATCH-APP-DEVELOPMENT.md            # 快速参考：手表应用
├── RAW-DECODE-SETUP.md                 # 快速参考：RAW解码
├── onedrive-sync-optimization.md       # 快速参考：OneDrive优化
├── libraw-native-integration-guide.md  # 快速参考：LibRaw集成
├── hybrid-compute-architecture.md      # 快速参考：混合计算
└── archived/                           # 历史文档存档
    ├── planning/                       # 功能规划
    ├── bugfixes/                       # 缺陷修复记录
    ├── database-history/               # 数据库迁移历史
    ├── analysis/                       # 优化和分析报告
    ├── temporary/                      # 临时注记
    └── legacy/                         # 遗留文档
```

---

## ✅ 执行清单

### 已完成:
- [x] ✅ 运行移动脚本，已将41个文件移动到 `archived/` 文件夹
- [x] ✅ 验证文件夹结构完整性
- [ ] 验证所有链接仍然正常（使用 Find All References）
- [ ] 提交 git 变更
- [ ] 更新项目README中的文档链接

### 未来维护:
- 新的计划和修复文档应直接放在 `archived/` 下的相应文件夹
- 每个季度检查是否有应该归档的新文件
- 保持 `/docs` 文件夹只包含当前活跃的开发参考文档

---

## 📚 查阅指南

| 需求 | 查看文档 |
|------|---------|
| 快速开始 | `DEVELOPER-MANUAL.md` |
| API使用 | `API_BASE-QUICK-REFERENCE.md` 或 `dev-manual/03-backend-api.md` |
| 数据库设计 | `dev-manual/02-database.md` |
| 前端开发 | `dev-manual/04-frontend.md` |
| 新功能实现 | `dev-manual/06-development.md` |
| 生产部署 | `dev-manual/07-deployment.md` 或 `DOCKER-BUILD-GUIDE.md` |
| 历史背景 | 查看 `archived/` 相应文件夹 |

---

## 🎯 目标成果

✅ **清洁的 `/docs` 文件夹** - 只包含当前活跃的参考文档  
✅ **完整的历史记录** - 所有文档保留在 git 中，通过 archived/ 访问  
✅ **改进的可导航性** - 新开发者能快速找到所需信息  
✅ **维护性** - 减少文档债务，简化维护工作流  

---

*此文档应在每次大规模文档重组后更新。*
