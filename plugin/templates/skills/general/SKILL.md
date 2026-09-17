---
name: general
description: 题材中性的长篇小说写作方法论：大纲结构、人物设计、场景推进、审稿要点。适用于任何类型。
---

# 通用题材包

这是 NovelWriter 的默认题材包，不预设时代、地域或流派。五个文件：

| 文件 | 用途 | 谁读 |
|---|---|---|
| outline-method.md | 大纲设计方法 | /novel:plan |
| character-method.md | 人物设计方法 | /novel:plan |
| writing-method.md | 章节写作方法 | writer |
| output-style.md | 文字风格规范 | writer |
| review-rules.md | 审稿要点 | reviewer |

要定制自己的题材包：复制这个目录改名，改写五个文件，在 `novel.yaml` 的 `skill` 字段填新目录名。可以加 `references/` 放资料，写作时在 writing-method.md 里说明怎么用。
