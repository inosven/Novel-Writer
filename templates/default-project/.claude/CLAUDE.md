# NovelWriter 项目配置

## 项目信息
本项目使用 NovelWriter AI 小说创作系统。

## 工作模式

### 模式一：基于大纲创作
```
用户想法 → 对话确定大纲 → 确定核心角色 → 撰写人物小传 → 按大纲逐章写作
```

### 模式二：续写功能
```
用户提供开头/片段 → 分析风格和设定 → 自动推断角色和情节 → 续写内容
```

## 常用命令

### 技能包管理
- `/skill list` - 列出所有技能包
- `/skill use [name]` - 切换技能包
- `/skill info [name]` - 查看技能包信息

### 大纲管理
- `/outline show` - 显示当前大纲
- `/outline edit` - 编辑大纲
- `/outline history` - 查看大纲历史

### 角色管理
- `/character list` - 列出所有角色
- `/character show [name]` - 查看角色详情
- `/character create [name]` - 创建新角色
- `/character edit [name]` - 编辑角色
- `/character delete [name]` - 删除角色

### 章节管理
- `/chapter list` - 列出所有章节
- `/chapter write [n]` - 写第n章
- `/chapter edit [n]` - 编辑第n章
- `/chapter review [n]` - 审稿第n章

### 参考文献
- `/ref list` - 列出参考文献
- `/ref add [type] [file]` - 添加参考文献
- `/ref search [query]` - 搜索参考内容

### 项目管理
- `/status` - 查看项目状态
- `/save` - 保存当前进度
- `/export` - 导出小说

## 文件结构

```
project/
├── outline.md                # 故事大纲
├── chapter_index.md          # 章节目录
├── characters/               # 人物小传
│   └── [角色名].md
├── chapters/                 # 章节正文
│   └── Chapter-XX.md
├── references/               # 参考资料
├── .state/                   # 系统状态（自动管理）
└── .claude/                  # 配置文件
    ├── CLAUDE.md
    └── skills/               # 技能包
```

## 创作流程

### 1. 初始化项目
首次使用时，系统会引导你完成：
- 选择技能包（决定题材和风格）
- 通过对话确定故事大纲
- 创建核心角色

### 2. 写作阶段
- 按大纲逐章写作
- 每章完成后自动审稿
- 根据反馈修改润色

### 3. 随时可用的功能
- 修改大纲（系统会分析影响）
- 增删改角色
- 精确修改某章某段

## 质量保证

### 审稿机制
每章完成后，Reviewer Agent 会检查：
- 历史准确性（参照 Ground Truth）
- 人物一致性（参照知识图谱）
- 逻辑连贯性
- 文风规范性

### 记忆系统
系统会自动维护：
- 向量数据库（语义检索）
- 标签索引（快速定位）
- 知识图谱（事实校验）

## 技能包说明

当前可用技能包：
- `sanguo-xuanyi` - 三国悬疑：三国时期古装悬疑小说

每个技能包包含：
- 大纲方法论
- 人物设定方法
- 写作技法
- 输出风格规范
- 审稿规则
- 模板和示例
- 参考文献（Ground Truth + Style References）

## 注意事项

1. **断点存续**：随时可以退出，下次继续
2. **版本历史**：大纲和章节的修改都有历史记录
3. **一致性检查**：修改角色/大纲时会提示可能的影响
4. **参考文献**：Ground Truth 为硬约束，Style References 为参考
