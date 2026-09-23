# NovelWriter

English | [中文](README.zh.md)

A Claude Code plugin for writing long-form fiction. It does not call a model API itself. Instead it gives Claude Code, running in your novel's directory under your own Claude subscription, a set of commands, subagents and a human-readable "story bible", and writes the book chapter by chapter.

## Why

The hard part of a long novel is not prose, it is continuity: in chapter 12 a character must still remember the wound from chapter 3, and must still not know what someone did behind his back in chapter 9. Summaries and vector search lose exactly these facts. NovelWriter keeps a readable ledger of "the state of the world as of chapter N", hands the whole thing to the model before every chapter, and has the model update it after every chapter is finalized.

## Install

Requires Claude Code 2.1 or later and Python 3 (for the reader UI only).

```bash
git clone https://github.com/inosven/Novel-Writer.git
cd Novel-Writer
bash plugin/tests/run.sh     # optional: check the scripts work on your system
```

Start Claude Code inside your novel's directory:

```bash
mkdir my-novel && cd my-novel
claude --plugin-dir /path/to/Novel-Writer/plugin
```

## Commands

| Command | What it does |
|---|---|
| `/novel:init [pack]` | Create a project. Uses the neutral `general` pack by default; `sanguo-xuanyi` is the sample genre pack |
| `/novel:plan` | Plan the book in dialogue: outline, character files, initial bible |
| `/novel:write N [model]` | Draft chapter N, then stop |
| `/novel:review N [model]` | Review chapter N; the report goes to `reviews/Chapter-NN.md` |
| `/novel:revise N [model] [instructions]` | Targeted edits from the review report, your notes, or your instructions; re-reviews automatically |
| `/novel:finalize N [model]` | Finalize: write the summary, update the bible |
| `/novel:auto N [model]` | Write through chapter N unattended: write, review, revise, re-review, finalize each chapter; stops only when a critical issue survives re-review |
| `/novel:rollback N` | Undo the finalize of chapter N and later: bible restored to "as of N-1", summaries moved to a backup, chapter text untouched |
| `/novel:insert K [title]` | Insert a chapter at position K and renumber what follows. Only after the finalized frontier |
| `/novel:delete K` | Delete chapter K (text and outline entry go to `.trash/`) and renumber what follows. Unfinalized chapters only |
| `/novel:export [txt\|epub] [dir]` | Merge the written chapters into `export/<title>.txt` and `.epub` (EPUB 3, no third-party tools) |
| `/novel:read [port\|stop]` | Open the reader UI: read, annotate selected text, search across files, see review items; `stop` shuts it down |
| `/novel:status` | Progress |

The typical loop is `write 3` → read it yourself, tweak by hand → `review 3` → `revise 3` → `finalize 3` → `write 4`. If you would rather not babysit it, `auto 6` runs chapter after chapter and only comes back to you when a critical issue is still there after one revision round. Before every re-review the old report is renamed to `reviews/Chapter-NN.v1.md`, and the reviewer reads that previous version: it keeps item numbers and severities and does not re-raise items you marked as "won't fix".

Writing chapter N requires the bible to stand at chapter N-1, so every chapter has to be finalized before the next one. This is deliberate: a bible that lags behind produces incoherent chapters.

To rewrite a chapter that is already finalized, `rollback N` restores the bible from the snapshot taken before that chapter was finalized (saved automatically in `bible/.history/before-NN/`), moves the summaries from chapter N on into `bible/.history/rollback-<timestamp>/`, and leaves the chapter text and reviews where they are. Then edit or `write N` again, review, finalize. Only chapters finalized after the snapshot feature was added can be rolled back.

To restructure, `insert K` and `delete K` rename the files, renumber the `### 第N章` headings in `outline.md`, shift every "第N章" reference in the outline and the bible, and adjust the introduced-in and expected-payoff columns of the thread table. Both only work past the finalized frontier; roll back first to touch a finalized chapter. Bare numbers inside tables are not touched, so glance over them afterwards.

## Reader UI

`/novel:read` starts a small local server (Python standard library only, bound to 127.0.0.1) and you read the book in the browser. Select a passage to **annotate** it ("something is wrong here") or to **search** for the same words across the book (chapters by default; outline, character files and bible can be ticked), and add the hits you tick to the same note. Notes live in `notes.md` at the project root; once you have collected a few, run `/novel:revise N` and the editor handles them together with the review report, marking each handled location. Review items are also located in the text, and you can mark one as "won't fix" with a reason right there.

## Choosing models

Each of the four subagents gets its model from the `models` section of `novel.yaml`. The defaults written by `init` are `opus` for the writer and the reviewer and `sonnet` for the editor and the archivist; `inherit` means "same as the main conversation". The main conversation only dispatches, so starting Claude Code with `claude --model sonnet` is enough.

To try another model for one run, add it after the chapter number:

```
/novel:write 5 opus                       # writer uses opus this time
/novel:auto 8 sonnet                      # every subagent uses sonnet for this run
/novel:auto 8 writer=opus,reviewer=haiku  # only the named roles change, the rest follow novel.yaml
/novel:revise 5 editor=sonnet make the ending shorter   # instructions go after the model
```

## Project layout

```
my-novel/
├── novel.yaml          title, genre pack, chapter length, models per subagent
├── outline.md          outline
├── notes.md            author annotations
├── characters/         character files
├── chapters/           text, Chapter-01.md …
├── summaries/          per-chapter summaries, written at finalize
├── reviews/            review reports
├── bible/              story bible
│   ├── state.md        state of the world as of chapter N: where everyone is, what they know, what they carry, injuries
│   ├── threads.md      planted threads and their payoffs
│   ├── timeline.md     timeline
│   ├── facts.md        hard facts
│   └── .history/       pre-finalize snapshots and rollback backups
├── export/             txt and epub from /novel:export
├── .novel/             context-pack scratch files, safe to delete
├── .trash/             chapters removed by delete, safe to delete
└── .claude/skills/<pack>/
```

Only `/novel:finalize` modifies the bible, but it is plain Markdown and you can edit it by hand at any time.

Chapter length is counted as CJK characters plus words in alphabetic scripts, punctuation excluded, so `chapter_words` works for Chinese, English and mixed text alike.

## Genre packs

A genre pack sets the outlining method, the character method, the prose style and the review checklist. Two ship with the plugin:

- `general`: genre-neutral, works for anything.
- `sanguo-xuanyi`: Three Kingdoms period mystery, included as a customization example.

To make your own, copy `plugin/templates/skills/general` into your project's `.claude/skills/<new-name>/`, rewrite the five method files, and set `skill` in `novel.yaml` to the new name. `init` copies the pack into the project, so each book can tune its own copy without touching the template.

## License

MIT
