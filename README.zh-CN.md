<div align="center">
  <img src="build/logo-text-squared.svg" alt="MouriCode" height="92" />
  <h1>MouriCode</h1>
  <p>
    <strong>
      并行 AI 编码任务 · 隔离的 Git 工作树 · 手机监控 · 全局助手实时状态报告
    </strong>
  </p>
  <p>
    <img src="https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white" alt="Electron" />
    <img src="https://img.shields.io/badge/SolidJS-2C4F7C?logo=solid&logoColor=white" alt="SolidJS" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/macOS%20%7C%20Linux-supported-lightgrey" alt="macOS | Linux" />
  </p>
  <p>
    <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
  </p>
  <p>
    <a href="#核心特性">核心特性</a> ·
    <a href="#截图展示">截图展示</a> ·
    <a href="#工作原理">工作原理</a> ·
    <a href="#全局助手">全局助手</a> ·
    <a href="#远程手机视图">远程手机视图</a> ·
    <a href="#安装运行">安装运行</a> ·
    <a href="#致谢">致谢</a>
  </p>
</div>

---

## 核心特性

- 并行运行多个 AI 编码代理，每个任务独立运行
- 完全隔离：每个任务拥有独立的 Git 分支和 `git worktree`
- 内置终端：AI 终端 + 可选的 Shell 终端供人工接管
- 任务级工作流：查看差异、提交、推送、合并、清理
- 远程手机视图，随时随地监控你的 AI 代理
- 全局助手：一键生成所有活跃任务的综合状态报告

---

## 截图展示

<p align="center">
  <img src="screens/1.jpg" alt="MouriCode 截图 1" width="900" />
</p>

<p align="center">
  <img src="screens/2.jpg" alt="MouriCode 截图 2" width="900" />
</p>

---

## MouriCode 能做什么

### 并行任务，零冲突

- 为同一个仓库创建多个任务
- 每个任务拥有独立的分支和工作树目录
- AI 代理之间互不干扰

### 支持的 AI 代理 CLI

- Claude Code
- Codex CLI
- OpenCode CLI

### 任务级 Git 工作流

每个任务可以：

- 查看修改的文件和差异对比
- 提交更改
- 推送到远程仓库
- 合并回主分支
- 切换/创建分支
- 关闭任务并清理工作树

### 直接模式

如果你想在主工作目录直接运行代理（不使用工作树），可以使用直接模式。

---

## 工作原理

当你创建一个任务时，MouriCode 会：

1. 从主分支创建一个新的 Git 分支
2. 为该分支设置一个 `git worktree`
3. 在工作树内启动选定的 AI 代理
4. 在 UI 中实时显示终端输出（可选同步到手机视图）

这使得真正的并行工作成为可能，不会产生分支冲突。

---

## 全局助手

MouriCode 包含一个由 MiniMax 驱动的全局助手面板。

当前行为（有意设计）：

- 不会自动运行任务或发送垃圾命令
- 监控活跃任务及其终端输出
- 点击**立即报告**时，生成所有活跃任务的综合状态报告
- 可以选择任务并手动向该任务的 AI CLI 发送指令

MiniMax 端点（默认）：

- `https://api.minimaxi.com/v1/text/chatcompletion_v2`

---

## 远程手机视图

- 在桌面应用中启用远程访问
- 用手机扫描二维码
- 通过 Wi-Fi 或 Tailscale 监控任务终端

---

## 安装运行

### 环境要求

- Node.js 18+
- npm
- 至少安装一个 AI 代理 CLI（Claude Code / Codex CLI / OpenCode CLI）

### 开发模式

```bash
git clone <your-repo-url>
cd mouri-code
npm install
npm run dev
```

### 构建

```bash
npm run build
```

---

## 仓库远程地址

当前工作区配置的 Git 远程仓库：

- `mine`: `git@github.com:mouritang/mouri-code.git`
- `origin`: `https://github.com/johannesjo/parallel-code.git`

---

## 致谢

MouriCode 是基于 **Parallel Code** 的修改版本。

感谢原作者和贡献者为本项目奠定的基础。

- 上游项目：Parallel Code (Johannesjo)
