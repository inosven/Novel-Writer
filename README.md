# NovelWriter - AI 小说创作助手

一个基于 Electron + React + TypeScript 的 AI 辅助小说创作桌面应用。集成多 Agent 协作、知识图谱、RAG 检索等能力，帮助作者从构思到成稿完成长篇小说创作。

## 功能特性

- **智能规划** — 通过多轮对话收集创作意图，AI 生成故事大纲、角色建议
- **章节写作** — 按大纲逐章创作，自动获取上下文（前文摘要、角色设定、RAG 检索）
- **多 Agent 协作** — Writer（写作）、Reviewer（审稿）、Editor（编辑）、Planner（策划）四个 Agent 各司其职
- **知识图谱** — 自动追踪人物关系、事件时间线，审稿时验证事实一致性
- **角色管理** — 创建和维护角色档案，包含性格、背景、弧光等完整人物小传
- **大纲管理** — 可视化编辑大纲，支持版本历史和回滚
- **技能系统** — 可加载不同写作风格/题材的预设（Skill），包含方法论、模板和示例
- **多 LLM 支持** — 支持 Claude、OpenAI、Ollama、OpenAI 兼容 API（如 Kimi、DeepSeek）
- **文件日志** — 主进程所有 console 输出自动写入日志文件（`.state/app.log`），支持轮转和自动截断

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 40 |
| 前端 | React 19 + TypeScript + TailwindCSS 4 |
| 状态管理 | Zustand |
| 构建工具 | Vite 5 + vite-plugin-electron |
| LLM 集成 | Anthropic SDK / OpenAI SDK / Ollama |
| 向量数据库 | LanceDB (本地嵌入式) |
| 知识图谱 | 自研 JSON 图谱引擎 |
| 数据存储 | Markdown 文件 + electron-store + SQLite |

## 项目结构

```
NovelWriter/
├── app/                          # 前端 React 应用
│   └── src/
│       ├── pages/                # 页面组件
│       │   ├── Dashboard.tsx     #   仪表盘 — 项目概览与快速操作
│       │   ├── Planning.tsx      #   规划页 — 多轮对话式故事策划
│       │   ├── Outline.tsx       #   大纲页 — 可视化大纲编辑与历史
│       │   ├── Characters.tsx    #   角色页 — 角色管理与创建
│       │   ├── Writing.tsx       #   写作页 — 章节列表、生成与编辑
│       │   └── Settings.tsx      #   设置页 — LLM 配置与技能管理
│       ├── components/layout/    # 布局组件（Header, Sidebar, Layout）
│       ├── stores/               # Zustand 状态管理
│       └── hooks/                # 自定义 Hooks（自动保存、恢复）
│
├── electron/                     # Electron 主进程
│   ├── main.ts                   # 应用入口 — 窗口创建、IPC 注册
│   ├── preload.ts                # 预加载脚本 — 安全暴露 API 到渲染进程
│   ├── utils/
│   │   └── logger.ts               # 文件日志 — 拦截 console 输出写入日志文件
│   ├── services/
│   │   └── OrchestratorService.ts  # 服务层 — 管理 Orchestrator 生命周期
│   └── ipc/                      # IPC 处理器（按功能模块拆分）
│       ├── config.ts             #   配置管理 IPC
│       ├── project.ts            #   项目管理 IPC
│       ├── planning.ts           #   规划流程 IPC
│       ├── writing.ts            #   写作与章节管理 IPC
│       ├── characters.ts         #   角色管理 IPC
│       ├── outline.ts            #   大纲管理 IPC
│       └── skills.ts             #   技能系统 IPC
│
├── src/                          # 核心业务逻辑（前后端共享）
│   ├── core/
│   │   ├── orchestrator/
│   │   │   └── Orchestrator.ts   # 中央协调器 — 管理所有 Agent 和工作流
│   │   ├── agents/               # AI Agent 系统
│   │   │   ├── BaseAgent.ts      #   Agent 基类 — 通用 LLM 交互、JSON 提取
│   │   │   ├── WriterAgent.ts    #   写作 Agent — 大纲生成、章节创作、续写
│   │   │   ├── ReviewerAgent.ts  #   审稿 Agent — 一致性检查、知识图谱验证
│   │   │   ├── EditorAgent.ts    #   编辑 Agent — 内容修订、润色、定向编辑
│   │   │   └── PlannerAgent.ts   #   策划 Agent — 需求收集、大纲设计、角色规划
│   │   └── state/
│   │       └── StateManager.ts   # 状态管理 — 进度追踪、检查点、会话管理
│   │
│   ├── documents/                # 文档管理层
│   │   ├── DocumentManager.ts    #   文件系统操作 — 章节/角色/大纲的读写
│   │   ├── OutlineManager.ts     #   大纲管理 — Markdown 解析/生成、版本历史
│   │   ├── CharacterManager.ts   #   角色管理 — CRUD、一致性检查、关系管理
│   │   └── ReferenceManager.ts   #   参考资料管理 — Ground Truth 和风格参考
│   │
│   ├── llm/                      # LLM 适配层
│   │   ├── LLMProvider.ts        #   基类与工厂 — LLM 提供者抽象
│   │   ├── ClaudeAdapter.ts      #   Claude API 适配器
│   │   ├── OpenAIAdapter.ts      #   OpenAI API 适配器
│   │   ├── OllamaAdapter.ts      #   Ollama 本地模型适配器
│   │   ├── OpenAICompatibleAdapter.ts  # OpenAI 兼容 API 适配器
│   │   └── ModelRouter.ts        #   模型路由 — 按任务类型选择模型
│   │
│   ├── memory/                   # 记忆系统
│   │   ├── MemorySystem.ts       #   统一记忆系统 — 整合 RAG、标签、知识图谱
│   │   ├── rag/
│   │   │   ├── LanceDBAdapter.ts #   向量数据库适配器
│   │   │   └── EmbeddingService.ts  # 嵌入向量服务
│   │   ├── graph/
│   │   │   └── KnowledgeGraph.ts #   知识图谱 — 实体、关系、事实验证
│   │   └── tags/
│   │       └── TagManager.ts     #   标签管理 — 内容分类与检索
│   │
│   ├── skills/
│   │   └── SkillLoader.ts        # 技能加载器 — 加载写作风格预设
│   │
│   └── types/
│       └── index.ts              # 全局类型定义
│
├── templates/                    # 项目模板（技能预设）
│   └── default-project/
│       └── .claude/skills/       # 内置技能包（如历史悬疑、武侠等）
│
├── vite.config.ts                # Vite 构建配置（含 Electron 插件）
├── tsconfig.json                 # TypeScript 配置
├── tailwind.config.js            # TailwindCSS 配置
└── package.json                  # 项目依赖与脚本
```

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                 │
│  ┌──────────────┐  ┌──────────────────────────────────┐ │
│  │ IPC Handlers │──│     OrchestratorService          │ │
│  │ (writing,    │  │  (manages Orchestrator lifecycle) │ │
│  │  planning,   │  └──────────┬───────────────────────┘ │
│  │  outline...) │             │                          │
│  └──────┬───────┘             │                          │
│         │ contextBridge       │                          │
├─────────┼─────────────────────┼──────────────────────────┤
│         │                     ▼                          │
│  ┌──────┴───────┐  ┌──────────────────────┐              │
│  │   Preload    │  │    Orchestrator       │              │
│  │  (secure     │  │  ┌────────────────┐  │              │
│  │   API bridge)│  │  │ WriterAgent    │  │              │
│  └──────┬───────┘  │  │ ReviewerAgent  │  │              │
│         │          │  │ EditorAgent    │  │              │
│         ▼          │  │ PlannerAgent   │  │              │
│  ┌──────────────┐  │  └────────────────┘  │              │
│  │  React App   │  │  ┌────────────────┐  │              │
│  │  (Renderer)  │  │  │ MemorySystem   │  │              │
│  │  ┌────────┐  │  │  │ DocumentMgr    │  │              │
│  │  │ Pages  │  │  │  │ OutlineMgr     │  │              │
│  │  │ Stores │  │  │  │ CharacterMgr   │  │              │
│  │  │ Hooks  │  │  │  │ StateManager   │  │              │
│  │  └────────┘  │  │  └────────────────┘  │              │
│  └──────────────┘  └──────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

## 快速开始

### 环境要求

- Node.js >= 20.0.0
- npm

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/your-username/NovelWriter.git
cd NovelWriter

# 安装依赖
npm install

# 构建项目
npm run build

# 启动应用
npx electron .
```

### 开发模式

```bash
# 启动 Vite 开发服务器 + Electron（热重载）
npm run dev
```

### 打包发布

```bash
# Windows
npm run electron:build:win

# macOS
npm run electron:build:mac

# Linux
npm run electron:build:linux
```

## 使用流程

1. **设置 LLM** — 首次启动后，进入设置页配置 LLM 提供者（API Key、模型等）
2. **创建项目** — 在仪表盘选择一个文件夹创建新项目，可选择写作风格预设
3. **故事规划** — 在规划页与 AI 对话，描述创作想法，AI 帮助完善构思
4. **生成大纲** — 确认构思后生成完整章节大纲，可反复修改；完成后仍可重新生成
5. **创建角色** — 根据大纲建议创建角色档案，填充人物小传；完成后仍可重新生成
6. **逐章写作** — 在写作页选择章节，AI 根据大纲和上下文生成内容
7. **审稿编辑** — 审稿 Agent 检查一致性，编辑 Agent 根据反馈修订

## 核心概念

### 索引约定
全系统统一使用 **1-based 索引**：第 1 章 = index 1，文件名 `Chapter-01.md`。

### 技能系统 (Skills)
技能是一组写作风格预设，包含：
- `config.yaml` — 风格参数（语调、对话占比、节奏等）
- `outline-method.md` — 大纲设计方法论
- `character-method.md` — 角色设计方法论
- `output-style.md` — 文风规范
- `templates/` — 输出模板
- `examples/` — 风格示例

### 章节管理
- **插入章节** — 在任意位置插入新章节，后续章节自动重编号
- **删除章节** — 删除章节文件并重新编号，操作原子化（单次 IPC 调用）
- **版本历史** — 大纲修改自动保存历史，支持回滚

## License

MIT
