# MouriCode Developer Guide

这份文档面向开发者，介绍 MouriCode 的仓库结构、开发命令、构建方式、关键架构和当前本地远程仓库配置。

---

## 项目定位

MouriCode 是一个基于 Electron 的 AI 编码任务工作台。

核心能力包括：

- 多任务 AI CLI 并行运行
- 自动分支 / worktree 隔离
- 任务级终端与 shell 接管
- 手机远程查看
- 全局助理统一汇报任务状态

---

## 当前版本

- 应用名：`MouriCode`
- 当前版本：`1.6.0`
- 打包产品名：`MouriCode`

相关配置：

- `package.json`
- `electron/main.ts`
- `index.html`
- `src/remote/index.html`

---

## 本地 Git 远程仓库

当前仓库配置的远程地址如下：

- `mine`：`git@github.com:mouritang/mouri-code.git`
- `origin`：`https://github.com/johannesjo/parallel-code.git`

说明：

- `origin` 看起来是上游仓库
- `mine` 是个人 GitHub fork
- `gitee` 是国内镜像 / 工作仓库

如果要做发布流程统一，建议明确：

1. 哪个仓库是主开发仓库
2. 哪个仓库用于对外发布
3. 是否需要保留多 remote 协同流程

---

## 技术栈

- UI：SolidJS
- 语言：TypeScript（strict）
- 桌面运行时：Electron
- 终端管理：`node-pty`
- 构建工具：Vite
- 测试：Vitest
- 打包：electron-builder
- 包管理器：npm

---

## 目录结构

```text
.
├── src/
│   ├── components/         # 桌面端 UI 组件
│   ├── store/              # 前端状态管理
│   ├── lib/                # 工具函数、IPC 封装、UI 辅助
│   └── remote/             # 手机远程页面
├── electron/
│   ├── ipc/                # Electron 主进程 IPC 处理器
│   ├── remote/             # 手机远程服务
│   ├── monitor.global-monitor.ts
│   └── main.ts
├── build/                  # 图标、entitlements、构建资源
├── release/                # 打包输出目录
├── README.md               # 产品说明
└── README.dev.md           # 开发者说明
```

---

## 关键模块说明

### `electron/main.ts`

桌面主进程入口，负责：

- 修正 PATH
- 创建主窗口
- 注册 IPC
- 加载桌面端页面
- 管理应用生命周期

### `electron/ipc/`

主进程与渲染进程之间的能力入口，主要包括：

- `agents.ts`：支持的 AI CLI 定义
- `pty.ts`：终端/PTY 生命周期管理
- `tasks.ts`：任务创建与 worktree 逻辑
- `git.ts`：提交、推送、合并、diff 等 Git 操作
- `persistence.ts`：本地状态保存与恢复
- `register.ts`：统一注册 IPC handler

### `electron/monitor.global-monitor.ts`

当前全局助理核心逻辑：

- 收集所有运行中 AI 任务的终端输出
- 调用 MiniMax API 生成任务汇报
- 输出：
  - 总结摘要
  - 风险提醒
  - 各任务状态列表

当前版本中，这个模块已经改为：

- 不再自动持续分析所有任务
- 由用户点击 `立即汇报` 时执行一次汇总

### `src/components/GlobalAssistantCard.tsx`

全局助理面板 UI，负责：

- 展示助理状态
- 展示任务状态汇报
- 手动选择目标任务
- 输入指令并发送给目标任务当前运行中的 AI CLI
- 收起 / 展开
- 内部滚动

### `src/store/monitor.ts`

全局助理前端状态层，负责：

- 保存 API 配置
- 拉取汇报结果
- 手动触发 `立即汇报`
- 把手动输入的 prompt 发给指定任务

---

## 当前已经做过的重要产品改造

### 品牌与命名统一

已统一为：

- `MouriCode`
- 不再使用旧的 `Mouri Code` / `并行代码`

### 全局助理能力升级

已经完成：

- API Key 状态同步修复
- `立即分析` 改为 `立即汇报`
- 支持任务状态汇总
- 支持任务选择 + 手动输入 + 手动发送
- 支持面板折叠与滚动

### MiniMax 接口接入

默认端点：

- `https://api.minimaxi.com/v1/text/chatcompletion_v2`

已验证：

- 能正常调用真实接口
- 能正确处理 `base_resp.status_code`
- 能正确解析模型 JSON 返回

### 安装包与发布物统一

当前打包产物命名已统一为：

- `MouriCode.app`
- `MouriCode-<version>-arm64.dmg`
- `MouriCode-<version>-arm64-mac.zip`

---

## 开发命令

### 本地开发

```bash
npm install
npm run dev
```

### 检查

```bash
npm run typecheck
npm run test
npm run lint
```

### 构建

```bash
npm run build:frontend
npm run build:remote
npm run compile
npm run build
```

---

## macOS 打包说明

### 生成 `.app`

```bash
npx electron-builder --config.mac.identity=null --dir
```

输出目录通常是：

```text
release/mac-arm64/MouriCode.app
```

### 生成 `.zip`

```bash
npx electron-builder --config.mac.identity=null --mac zip
```

### 生成 `.dmg`

如果 `electron-builder` 的 dmg 依赖下载失败，可以先生成 `.app`，再手工用 `hdiutil` 打包：

```bash
hdiutil create \
  -volname "MouriCode 1.6.0" \
  -srcfolder <staging-dir> \
  -ov -format UDZO \
  MouriCode-1.6.0-arm64.dmg
```

这是当前仓库在本机上最稳定的 macOS 打包方式。

---

## 开发注意事项

### 1. Electron dev 与 packaged 行为不同

开发模式使用：

- Vite dev server
- Electron 读取 `dist-electron/main.js`

打包模式则读取：

- `dist/`
- `dist-electron/`
- `dist-remote/`

因此改完前端或主进程逻辑后，最好同时验证：

- `npm run dev`
- `npm run compile`
- 打包后的 `release/mac-arm64/MouriCode.app`

### 2. `node-pty` 需要重建

每次打包时，electron-builder 会自动为目标 Electron 版本重建 `node-pty`。

### 3. 全局助理依赖活跃任务输出

如果运行中的任务还没有任何终端输出，全局助理只能看到“暂无终端输出”或“任务初始化中”，这是符合当前设计的。

### 4. 多个应用名可能同时存在

如果机器上同时装过旧版：

- `Mouri Code.app`
- `MouriCode.app`

容易误开旧版。发布和测试前建议清理旧 app。

---

## 建议的后续开发方向

### 产品层

- 全局助理支持保存常用指令模板
- 一次向多个任务广播同一条指令
- 更细的任务状态分类
- 发布看板 / 团队协作

### 工程层

- 统一主 remote 与 fork remote 说明
- 补充 tray / 右键菜单显式实现（如果后续需要）
- 为全局助理增加更多测试覆盖
- 补充打包 / 发布自动化脚本

---

## 适合开发者先看的文件

如果你第一次接手这个仓库，建议按这个顺序看：

1. `README.md`
2. `CLAUDE.md`
3. `electron/main.ts`
4. `electron/ipc/register.ts`
5. `electron/monitor.global-monitor.ts`
6. `src/components/GlobalAssistantCard.tsx`
7. `src/store/monitor.ts`
8. `src/components/TaskPanel.tsx`
9. `src/store/tasks.ts`
