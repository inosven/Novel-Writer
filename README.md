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

Nothing is installed globally: you point Claude Code at the `plugin/` folder every time you start it (step 1 below).

## Getting started: your first chapter, step by step

Everything happens inside one folder, one folder per book. Claude Code runs in that folder; the plugin adds `/novel:...` commands to it. In every command below, `N` is a chapter number: `/novel:write 3` means "write chapter 3".

**1. Create a folder and start Claude Code in it.**

```bash
mkdir my-novel && cd my-novel
claude --plugin-dir /path/to/Novel-Writer/plugin
```

`/path/to/Novel-Writer` is wherever you cloned this repository. You now have a normal Claude Code session; type the commands below at its prompt.

**2. Initialize the project.**

```
/novel:init
```

It asks for a title, then creates `novel.yaml`, `characters/`, `chapters/`, `reviews/`, `summaries/`, an empty `bible/` and copies the `general` genre pack into `.claude/skills/`. Use `/novel:init sanguo-xuanyi` to start from the Three Kingdoms mystery pack instead.

**3. Plan the book in dialogue.**

```
/novel:plan
```

Claude asks you one question at a time: premise, theme, length, main characters, how the story ends. Answer in plain sentences. At the end it writes `outline.md` (one entry per chapter with a summary, key events and cast), one file per character in `characters/`, and the starting state of the bible. Open these files and edit anything you disagree with; they are plain Markdown.

**4. Write chapter 1.**

```
/novel:write 1
```

A writer subagent reads the outline entry for chapter 1, the character files, the bible and the genre pack, then writes `chapters/Chapter-01.md` and stops. Nothing else changes. Read the draft; fix small things by hand if you like.

**5. Get it reviewed.**

```
/novel:review 1
```

A reviewer subagent checks the draft against the bible, the outline and the character files, and writes `reviews/Chapter-01.md`: a list of problems graded critical (contradicts established facts), major (plot or motivation holes), minor and suggestion, each with the quoted sentence, the evidence and a suggested fix. The summary line and the critical items are shown in the chat.

**6. Fix what the review found.**

```
/novel:revise 1
```

An editor subagent applies the critical and major items with targeted edits (it never rewrites the whole chapter), marks each item in the report as handled, and the chapter is automatically reviewed again. If you would rather give your own instructions, write them after the chapter number: `/novel:revise 1 cut the flashback in the middle`.

**7. Finalize the chapter.**

```
/novel:finalize 1
```

This is the step that makes the book coherent. An archivist subagent writes `summaries/Chapter-01.md` and updates the four bible files: where every character is and what they know, which threads were planted or paid off, the timeline, and new hard facts. From now on chapter 1 is "canon". The next chapter cannot be written until this step is done, on purpose.

**8. Repeat for the next chapter.**

```
/novel:write 2
```

Same loop: write, review, revise, finalize. Each chapter's writer receives the whole bible plus the end of the previous chapter, so it knows exactly where the story stands.

**9. Or let it run.**

```
/novel:auto 6
```

Writes, reviews, revises once and finalizes every chapter up to chapter 6 without asking. It stops early only if a chapter still has a critical issue after one revision, and tells you what to look at.

**10. Read with a pen in hand.**

```
/novel:read
```

Opens `http://127.0.0.1:8765` in your browser. Select any sentence and click "批注" to leave a note ("this is wrong"), or "查找" to find the same words elsewhere in the book and attach those places to the same note. Your notes go to `notes.md`; the next `/novel:revise N` handles them together with the review report. `/novel:read stop` shuts the server down.

**11. Export.**

```
/novel:export
```

Writes `export/<title>.txt` and `export/<title>.epub` from the chapters written so far.

`/novel:status` at any time shows which chapters exist, which are finalized, how many notes are open and which threads are still unresolved.

## Command reference

`N` is a chapter number, `K` a position in the outline, `[model]` an optional model override (see below).

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
