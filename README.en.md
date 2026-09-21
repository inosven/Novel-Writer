# NovelWriter

A Claude Code plugin for writing long-form fiction. It runs inside your novel's directory with your own Claude subscription and keeps a human-readable "story bible" so later chapters stay consistent with earlier ones.

See [README.md](README.md) (Chinese) for installation and commands. Commands: `/novel:init`, `/novel:plan`, `/novel:write N`, `/novel:review N`, `/novel:revise N`, `/novel:finalize N`, `/novel:status`, `/novel:auto N` (write/review/revise/finalize chapter after chapter, stopping only when a critical issue survives re-review), `/novel:rollback N` (undo the finalize of chapter N and later: the bible is restored from the pre-finalize snapshot in `bible/.history/`, summaries are moved to a backup, chapter text stays). Per-agent models are set in `novel.yaml` (`models:`); append a model name or `role=model` list after the chapter number to override for one run, e.g. `/novel:auto 8 writer=opus,reviewer=haiku`.
