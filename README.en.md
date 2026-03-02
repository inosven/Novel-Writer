# NovelWriter - AI Novel Writing Assistant

English | **[中文](README.md)**

A desktop application built with Electron + React + TypeScript for AI-assisted novel writing. It integrates multi-agent collaboration, knowledge graphs, and RAG retrieval to help authors complete long-form fiction from concept to final draft.

## Features

- **Smart Planning** — Multi-turn dialogue to collect creative intent; AI generates story outlines and character suggestions
- **Chapter Writing** — Write chapter by chapter following the outline, with automatic context retrieval (previous chapter summaries, character profiles, RAG search)
- **Multi-Agent Collaboration** — Four specialized agents: Writer, Reviewer, Editor, and Planner, each handling their domain
- **Knowledge Graph** — Automatically tracks character relationships and event timelines; validates factual consistency during review
- **Character Management** — Create and maintain character profiles with personality, background, arc, and relationships
- **Outline Management** — Visual outline editing with version history and rollback support
- **Skill System** — Load preset writing styles/genres (Skills) including methodology, templates, and examples
- **Multi-LLM Support** — Supports Claude, OpenAI, Ollama, and OpenAI-compatible APIs (e.g., Kimi, DeepSeek)
- **File Logging** — All main process console output is automatically written to log files (`.state/app.log`) with rotation and auto-truncation

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Electron 40 |
| Frontend | React 19 + TypeScript + TailwindCSS 4 |
| State Management | Zustand |
| Build Tool | Vite 5 + vite-plugin-electron |
| LLM Integration | Anthropic SDK / OpenAI SDK / Ollama |
| Vector Database | LanceDB (local embedded) |
| Knowledge Graph | Custom JSON graph engine |
| Data Storage | Markdown files + electron-store + SQLite |

## Project Structure

```
NovelWriter/
├── app/                          # Frontend React application
│   └── src/
│       ├── pages/                # Page components
│       │   ├── Dashboard.tsx     #   Dashboard — project overview & quick actions
│       │   ├── Planning.tsx      #   Planning — multi-turn dialogue story planning
│       │   ├── Outline.tsx       #   Outline — visual outline editing & history
│       │   ├── Characters.tsx    #   Characters — character management & creation
│       │   ├── Writing.tsx       #   Writing — chapter list, generation & editing
│       │   └── Settings.tsx      #   Settings — LLM configuration & skill management
│       ├── components/layout/    # Layout components (Header, Sidebar, Layout)
│       ├── stores/               # Zustand state management
│       └── hooks/                # Custom hooks (auto-save, recovery)
│
├── electron/                     # Electron main process
│   ├── main.ts                   # App entry — window creation, IPC registration
│   ├── preload.ts                # Preload script — securely expose APIs to renderer
│   ├── utils/
│   │   └── logger.ts               # File logger — intercepts console output to log files
│   ├── services/
│   │   └── OrchestratorService.ts  # Service layer — manages Orchestrator lifecycle
│   └── ipc/                      # IPC handlers (split by feature module)
│       ├── config.ts             #   Configuration management IPC
│       ├── project.ts            #   Project management IPC
│       ├── planning.ts           #   Planning workflow IPC
│       ├── writing.ts            #   Writing & chapter management IPC
│       ├── characters.ts         #   Character management IPC
│       ├── outline.ts            #   Outline management IPC
│       └── skills.ts             #   Skill system IPC
│
├── src/                          # Core business logic (shared between processes)
│   ├── core/
│   │   ├── orchestrator/
│   │   │   └── Orchestrator.ts   # Central coordinator — manages all agents & workflows
│   │   ├── agents/               # AI Agent system
│   │   │   ├── BaseAgent.ts      #   Agent base class — LLM interaction, JSON extraction
│   │   │   ├── WriterAgent.ts    #   Writer Agent — outline generation, chapter writing
│   │   │   ├── ReviewerAgent.ts  #   Reviewer Agent — consistency checks, graph validation
│   │   │   ├── EditorAgent.ts    #   Editor Agent — content revision, targeted editing
│   │   │   └── PlannerAgent.ts   #   Planner Agent — requirements gathering, outline design
│   │   └── state/
│   │       └── StateManager.ts   # State management — progress tracking, checkpoints
│   │
│   ├── documents/                # Document management layer
│   │   ├── DocumentManager.ts    #   File system operations — chapter/character/outline I/O
│   │   ├── OutlineManager.ts     #   Outline management — Markdown parsing/generation
│   │   ├── CharacterManager.ts   #   Character management — CRUD, consistency checks
│   │   └── ReferenceManager.ts   #   Reference management — ground truth & style refs
│   │
│   ├── llm/                      # LLM adapter layer
│   │   ├── LLMProvider.ts        #   Base class & factory — LLM provider abstraction
│   │   ├── ClaudeAdapter.ts      #   Claude API adapter
│   │   ├── OpenAIAdapter.ts      #   OpenAI API adapter
│   │   ├── OllamaAdapter.ts      #   Ollama local model adapter
│   │   ├── OpenAICompatibleAdapter.ts  # OpenAI-compatible API adapter
│   │   └── ModelRouter.ts        #   Model router — selects model by task type
│   │
│   ├── memory/                   # Memory system
│   │   ├── MemorySystem.ts       #   Unified memory — integrates RAG, tags, knowledge graph
│   │   ├── rag/
│   │   │   ├── LanceDBAdapter.ts #   Vector database adapter
│   │   │   └── EmbeddingService.ts  # Embedding service
│   │   ├── graph/
│   │   │   └── KnowledgeGraph.ts #   Knowledge graph — entities, relations, fact validation
│   │   └── tags/
│   │       └── TagManager.ts     #   Tag management — content classification & retrieval
│   │
│   ├── skills/
│   │   └── SkillLoader.ts        # Skill loader — loads writing style presets
│   │
│   └── types/
│       └── index.ts              # Global type definitions
│
├── templates/                    # Project templates (skill presets)
│   └── default-project/
│       └── .claude/skills/       # Built-in skill packs (e.g., historical mystery, wuxia)
│
├── vite.config.ts                # Vite build configuration (with Electron plugin)
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.js            # TailwindCSS configuration
└── package.json                  # Dependencies & scripts
```

## Architecture Overview

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

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm

### Installation & Running

```bash
# Clone the repository
git clone https://github.com/your-username/NovelWriter.git
cd NovelWriter

# Install dependencies
npm install

# Build the project
npm run build

# Launch the application
npx electron .
```

### Development Mode

```bash
# Start Vite dev server + Electron (with hot reload)
npm run dev
```

### Packaging for Distribution

```bash
# Windows
npm run electron:build:win

# macOS
npm run electron:build:mac

# Linux
npm run electron:build:linux
```

## Usage Workflow

1. **Configure LLM** — On first launch, go to Settings and configure your LLM provider (API key, model, etc.)
2. **Create a Project** — On the Dashboard, select a folder to create a new project; optionally choose a writing style preset
3. **Story Planning** — On the Planning page, chat with AI to describe your creative vision; AI helps refine your concept
4. **Generate Outline** — Once the concept is confirmed, generate a full chapter outline; iterate as needed; can be regenerated even after finalization
5. **Create Characters** — Based on outline suggestions, create character profiles with full backstories; can be regenerated even after finalization
6. **Write Chapters** — On the Writing page, select a chapter and let AI generate content based on the outline and context
7. **Review & Edit** — The Reviewer agent checks consistency; the Editor agent revises based on feedback

## Key Concepts

### Indexing Convention
The entire system uses **1-based indexing**: Chapter 1 = index 1, filename `Chapter-01.md`.

### Skill System
A Skill is a writing style preset package containing:
- `config.yaml` — Style parameters (tone, dialogue ratio, pacing, etc.)
- `outline-method.md` — Outline design methodology
- `character-method.md` — Character design methodology
- `output-style.md` — Writing style specification
- `templates/` — Output templates
- `examples/` — Style examples

### Chapter Management
- **Insert Chapter** — Insert a new chapter at any position; subsequent chapters are automatically renumbered
- **Delete Chapter** — Delete a chapter file and renumber remaining chapters; operations are atomic (single IPC call)
- **Version History** — Outline modifications are automatically saved to history with rollback support

## License

MIT
