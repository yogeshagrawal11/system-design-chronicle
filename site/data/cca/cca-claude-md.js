SD.concept({
  id: 'cca-claude-md',
  category: 'cca',
  domain: 3,
  tasks: ['3.1'],
  order: 1,
  icon: '📜',
  title: 'CLAUDE.md Hierarchy, @imports & .claude/rules',
  tagline: 'Put each instruction at the scope where it belongs: personal, team-shared or package-specific, and check what actually loaded before blaming the model.',
  summary:
    "Every Claude Code session begins with an empty context window. **CLAUDE.md** files are how you give it standing instructions such as build commands, conventions, architecture notes and \"always do X\" rules. They are plain markdown files read automatically, and *where* a file lives decides *who* gets it and *when* it loads.\n\n" +
    "The exam guide describes three levels: **user** (`~/.claude/CLAUDE.md`, only you, never in git), **project** (`./CLAUDE.md` or `./.claude/CLAUDE.md`, committed and shared with the team) and **directory** (a `CLAUDE.md` inside a subfolder, loaded when Claude works there). The current docs add an org-wide **managed policy** file and a personal, git-ignored **`CLAUDE.local.md`**. All discovered files are **concatenated** rather than overriding one another, so contradictions between them create ambiguity rather than a clean override.\n\n" +
    "Two tools keep large setups maintainable. **`@path` imports** pull other files (a shared standards doc, the README, `package.json`) into a CLAUDE.md, so each package can include just the standards its maintainers know apply. The **`.claude/rules/`** directory splits a monolithic file into topic files (`testing.md`, `api-conventions.md`, `deployment.md`) that can be owned and reviewed separately. When behaviour is inconsistent, run **`/memory`** (and, in current builds, **`/context`**) to see which memory files the session actually has before you change anything.",
  analogy:
    "Think of a new hire's onboarding binder. The company handbook (managed policy) goes to everyone. Your own sticky notes (user CLAUDE.md) stay on *your* desk, and a colleague who joins next week never sees them. The team's wiki page (project CLAUDE.md) is the shared source of truth. Each workshop on the factory floor has a laminated sheet by the door (directory CLAUDE.md) that you read only when you walk in. Instead of one 400-page binder, the wiki links to separate chapters (`@imports`, `.claude/rules/`) so the safety team can own the safety chapter. If a worker keeps breaking a rule, first check whether the sheet was actually in their binder.",
  diagram: {
    intro: 'Files on the left load at launch and are concatenated into the context. The files on the right are discovered later, when Claude reads or edits a file that triggers them.',
    nodes: [
      { id: 'imports', label: '@imported files', sub: 'standards/*.md, README', type: 'storage', col: 2, row: 0, desc: 'Files referenced with `@path` inside a CLAUDE.md. They are expanded inline when the CLAUDE.md that references them loads. Relative paths resolve from the importing file, and imports can nest a few levels deep. They help organization but cost the same tokens as inline text.' },
      { id: 'managed', label: 'Managed policy', sub: '/etc/claude-code/CLAUDE.md', type: 'auth', col: 1, row: 1, desc: 'An org-wide file deployed by IT through MDM or Ansible (or inline via the `claudeMd` managed setting). It loads first, applies to every repo on the machine and cannot be excluded by users. It is not part of the guide\'s three-level model, but it is in the current docs.' },
      { id: 'project', label: 'Project CLAUDE.md', sub: './CLAUDE.md or .claude/', type: 'storage', col: 2, row: 1, desc: 'The team-shared file, committed to version control. Build/test commands, architecture, naming rules. This is where anything a new teammate must receive belongs.' },
      { id: 'local', label: 'CLAUDE.local.md', sub: 'git-ignored, personal', type: 'storage', col: 3, row: 1, desc: 'Personal, project-specific notes (your sandbox URL, preferred test account). Appended after CLAUDE.md in the same directory. Add it to `.gitignore`. It exists only in the worktree where you created it.' },
      { id: 'user', label: '~/.claude/CLAUDE.md', sub: 'user level, all projects', type: 'storage', col: 1, row: 2, desc: 'Your personal preferences across every project. It is not in any repository, so teammates never receive it, which is the classic cause of "it works for me but not for the new hire".' },
      { id: 'loader', label: 'Launch loader', sub: 'walks cwd → root', type: 'service', col: 2, row: 2, desc: 'At session start Claude Code reads CLAUDE.md and CLAUDE.local.md in the working directory and every ancestor directory, plus user/managed files and unconditional rules, and concatenates them. Ancestors come first, so the file nearest your working directory is read last.' },
      { id: 'context', label: 'Context window', sub: 'memory files + chat', type: 'ml', col: 3, row: 2, desc: 'Everything loaded becomes part of the prompt Claude sees. Instructions are context, not enforcement: Claude follows concrete, consistent instructions well, but a hook or permission rule is needed to *guarantee* a behaviour.' },
      { id: 'userrules', label: '~/.claude/rules/', sub: 'personal rule files', type: 'storage', col: 1, row: 3, desc: 'Personal topic files that apply to every project on your machine. They load before project rules. If a user rule and a project rule disagree, neither formally wins.' },
      { id: 'projrules', label: '.claude/rules/*.md', sub: 'topic files, no paths:', type: 'storage', col: 2, row: 3, desc: 'Topic-specific rule files (testing.md, api-conventions.md, deployment.md), discovered recursively. Without `paths:` frontmatter they load at launch with the same priority as `.claude/CLAUDE.md`. With `paths:` they load only for matching files (see the path-rules page).' },
      { id: 'memcmd', label: '/memory · /context', sub: 'inspect what loaded', type: 'monitor', col: 3, row: 3, desc: '`/memory` lists the user and project memory files, opens them in your editor (creating missing ones) and toggles auto memory. `/context` shows the Memory files that actually loaded in this session. The exam guide names `/memory` as the verification tool.' },
      { id: 'subdir', label: 'Subdir CLAUDE.md', sub: 'packages/billing/', type: 'storage', col: 4, row: 1, desc: 'A directory-level file. It is not loaded at launch (unless you launched inside that directory). It loads the first time Claude reads, writes or edits a file in that subtree.' },
      { id: 'pathrule', label: 'Path-scoped rule', sub: 'paths: **/*.test.ts', type: 'storage', col: 4, row: 3, desc: 'A `.claude/rules/` file with a `paths:` glob. It joins the context only when Claude touches a matching file, which keeps unrelated conventions out of the prompt.' },
      { id: 'tool', label: 'Read / Edit tool', sub: 'touches a file', type: 'service', col: 5, row: 2, desc: 'File access is the trigger for on-demand memory. Reading or editing `packages/billing/src/invoice.test.ts` pulls in that folder\'s CLAUDE.md and any rule whose glob matches the path.' },
      { id: 'dev', label: 'Developer', sub: 'asks for a change', type: 'client', col: 6, row: 2, desc: 'The person driving the session. Their request decides which files Claude opens, and therefore which on-demand instructions appear.' },
    ],
    edges: [
      { from: 'imports', to: 'project', label: 'expanded into' },
      { from: 'managed', to: 'loader' },
      { from: 'project', to: 'loader' },
      { from: 'local', to: 'loader' },
      { from: 'user', to: 'loader' },
      { from: 'userrules', to: 'loader' },
      { from: 'projrules', to: 'loader' },
      { from: 'loader', to: 'context', label: 'concatenate' },
      { from: 'memcmd', to: 'context', label: 'inspect' },
      { from: 'dev', to: 'tool', label: 'request' },
      { from: 'tool', to: 'subdir', label: 'on demand' },
      { from: 'tool', to: 'pathrule', label: 'glob match' },
      { from: 'subdir', to: 'context', async: true },
      { from: 'pathrule', to: 'context', async: true },
    ],
    flows: [
      {
        id: 'launch', name: 'What loads when you start Claude at the repo root',
        steps: [
          { from: 'managed', to: 'loader', text: 'The org-wide managed CLAUDE.md is read first. It applies to every repo and cannot be excluded.' },
          { from: 'user', to: 'loader', text: 'Your personal ~/.claude/CLAUDE.md comes next, with the same content in every project.' },
          { from: 'userrules', to: 'loader', text: 'Personal rule files in ~/.claude/rules/ load before any project rules.' },
          { from: 'imports', to: 'project', text: 'The project CLAUDE.md contains `@docs/build.md` and `@standards/api-errors.md`, which are expanded inline.' },
          { from: 'project', to: 'loader', text: 'The expanded project file (committed, team-shared) joins the stack.' },
          { from: 'projrules', to: 'loader', text: 'Every .claude/rules/*.md without a `paths:` field loads unconditionally.' },
          { from: 'local', to: 'loader', text: 'CLAUDE.local.md is appended last at the root level, so your personal notes are read last at that level.' },
          { from: 'loader', to: 'context', text: 'Everything is concatenated. Nothing overrides anything else, so contradictions remain for Claude to resolve.' },
        ],
      },
      {
        id: 'ondemand', name: 'Editing a test file deep in a package',
        steps: [
          { from: 'dev', to: 'tool', text: '"Add a test for late-fee rounding in packages/billing."' },
          { at: 'tool', text: 'Claude opens packages/billing/src/invoice.test.ts with the Read tool.' },
          { from: 'tool', to: 'subdir', text: 'This is the first file touched under packages/billing/, so packages/billing/CLAUDE.md is discovered now.' },
          { from: 'subdir', to: 'context', text: 'Billing conventions (money as integer cents, Decimal rounding mode) join the context.' },
          { from: 'tool', to: 'pathrule', text: '.claude/rules/testing.md has `paths: ["**/*.test.ts"]`, which matches.' },
          { from: 'pathrule', to: 'context', text: 'Testing conventions load too. A session that never touched a test file would not have paid for them.' },
        ],
      },
      {
        id: 'diagnose', name: 'New teammate is missing the team rules',
        steps: [
          { from: 'dev', to: 'memcmd', text: 'A new hire reports that Claude keeps using `console.log` although the team\'s logger rule should apply. They run /memory and /context.' },
          { from: 'memcmd', to: 'context', text: 'The loaded files are the project CLAUDE.md and rules. There is no logger rule anywhere in them.' },
          { at: 'user', text: 'The tech lead finds the rule in *their own* ~/.claude/CLAUDE.md. It never reached version control.' },
          { from: 'user', to: 'project', text: 'The rule moves into the project CLAUDE.md (or .claude/rules/logging.md) and is committed.' },
          { from: 'project', to: 'loader', text: 'After pulling, every teammate\'s session loads the rule at launch.' },
          { from: 'memcmd', to: 'context', text: 'The new hire re-runs /memory and sees the file listed. The behaviour is now consistent across the team.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'The hierarchy: who sees what, and when it loads',
      md: "The scope you choose decides whether an instruction reaches the team at all. The guide frames it as **user → project → directory**. The docs also list a managed policy file and `CLAUDE.local.md`:\n\n" +
        "Loading rules worth memorising:\n\n" +
        "- Files in the working directory **and every ancestor** load at launch. Start Claude in `repo/services/orders/` and you get `repo/CLAUDE.md` *and* `repo/services/orders/CLAUDE.md`.\n" +
        "- Files in **subdirectories below** the working directory load **on demand**, the first time Claude reads or edits something in that subtree.\n" +
        "- Everything is **concatenated, not overridden**. Order runs from the filesystem root down to the working directory, and `CLAUDE.local.md` comes after `CLAUDE.md` in the same folder. More specific text is read later, but if two files contradict each other Claude may follow either one, so remove the conflict.\n" +
        "- CLAUDE.md is **guidance, not enforcement**. To block `git push --force` or writes to `.env`, use permission `deny` rules or a PreToolUse hook (Domain 1).\n" +
        "- Keep each file short. The docs suggest under ~200 lines, because longer files consume context and reduce adherence. Block-level HTML comments (`<!-- note for maintainers -->`) are stripped before injection.",
      table: {
        headers: ['Scope', 'Location', 'Shared via git?', 'Loads', 'Put here'],
        rows: [
          ['Managed policy (docs)', '`/Library/Application Support/ClaudeCode/CLAUDE.md` (macOS), `/etc/claude-code/CLAUDE.md` (Linux)', 'No, deployed by IT', 'Launch, first, cannot be excluded', 'Company security and compliance reminders'],
          ['User', '`~/.claude/CLAUDE.md`, `~/.claude/rules/`', '**No**, only you', 'Launch, every project', 'Your style preferences, personal shortcuts'],
          ['Project', '`./CLAUDE.md` or `./.claude/CLAUDE.md`, `.claude/rules/`', '**Yes**', 'Launch', 'Build/test commands, architecture, team conventions'],
          ['Local (docs)', '`./CLAUDE.local.md` (git-ignored)', 'No', 'Launch, after CLAUDE.md', 'Your sandbox URLs, test accounts for this repo'],
          ['Directory', '`packages/billing/CLAUDE.md`', 'Yes', 'On demand, when Claude touches that subtree', 'Conventions that only apply inside one folder'],
        ],
      },
      callout: { type: 'warn', md: "**Exam trap:** if a teammate \"isn't getting\" an instruction, first check whether it lives at **user level**. `~/.claude/CLAUDE.md` is never committed, so only its author benefits." },
    },
    {
      h: '@imports: modular CLAUDE.md files',
      md: "Any CLAUDE.md can pull in other files with `@path`. The imported content is expanded inline when the importing file loads.\n\n" +
        ["```", "# packages/payments/CLAUDE.md", "Payments service. Money is always integer cents.", "", "## Standards that apply here", "- @../../standards/pci-handling.md", "- @../../standards/api-error-format.md", "- @../../standards/idempotency-keys.md", "", "## Commands", "See @package.json for scripts. Run `pnpm test:payments` before committing.", "```", "", "```", "# packages/web/CLAUDE.md", "- @../../standards/accessibility.md", "- @../../standards/react-components.md", "```"].join("\n") + "\n\n" +
        "This is the guide's *\"selectively include relevant standards based on maintainer domain knowledge\"* skill. The payments maintainers know PCI and idempotency matter to them and accessibility does not, while the web maintainers choose the opposite. One copy of each standard lives in `standards/`, so nothing drifts.\n\n" +
        "Details from the docs:\n\n" +
        "- Relative paths resolve from **the file containing the import**, not from your working directory. Absolute and `~/` paths also work.\n" +
        "- Imports can nest. The current docs cap recursion at **four hops** (older docs said five), so don't build deep chains.\n" +
        "- Text inside `` `backticks` `` or fenced code blocks is **not** imported. Writing `` `@docs/style.md` `` only prints the name.\n" +
        "- Imports that point **outside** the project trigger a one-time approval dialog, because a cloned repo could otherwise pull arbitrary files into your context.\n" +
        "- Imports organise content but **do not save tokens**: imported files load at launch with their parent. Use path-scoped rules or skills when you want content to load only sometimes.",
    },
    {
      h: '.claude/rules/: splitting a monolithic CLAUDE.md',
      md: "Once a root CLAUDE.md passes a few hundred lines and has four teams editing it, it becomes hard to review, prone to merge conflicts and full of stale or contradictory lines. Split it by topic:\n\n" +
        ["```", "repo/", "├── CLAUDE.md                  # short: what the repo is, how to build/test", "├── .claude/", "│   └── rules/", "│       ├── testing.md         # owned by QA guild", "│       ├── api-conventions.md # owned by platform team", "│       ├── deployment.md      # owned by SRE", "│       ├── security.md        # owned by AppSec", "│       └── frontend/", "│           └── components.md  # subfolders are discovered recursively", "└── packages/ ...", "```"].join("\n") + "\n\n" +
        "- Rules **without** `paths:` frontmatter load at launch, like a section of the project CLAUDE.md, but each topic is now a separate file that can have its own CODEOWNERS entry and review.\n" +
        "- Rules **with** `paths:` load only when matching files are touched. That is Task 3.3, see [path-specific rules](#/concept/cca-path-rules).\n" +
        "- `~/.claude/rules/` holds personal rules for all your projects. Symlinks let several repos share a rules folder.",
      table: {
        headers: ['Approach', 'Loads', 'Best for', 'Weakness'],
        rows: [
          ['One big root CLAUDE.md', 'Always, all of it', 'Small repos, under ~200 lines', 'Bloat, conflicts, low adherence as it grows'],
          ['CLAUDE.md + `@imports`', 'Always, when parent loads', 'Re-using shared standards per package', 'No token saving; deep chains get confusing'],
          ['`.claude/rules/*.md` (no paths)', 'Always', 'Separately owned topic files', 'Still always in context'],
          ['`.claude/rules/*.md` with `paths:`', 'Only for matching files', 'File-type conventions (tests, Terraform, migrations)', 'Not present until a matching file is touched'],
          ['Subdirectory CLAUDE.md', 'When that subtree is touched', 'Folder-specific context', 'Cannot target a file type spread across many folders'],
          ['Skill (`.claude/skills/`)', 'Only when invoked or judged relevant', 'Procedures and workflows', 'Not a place for universal must-follow rules'],
        ],
      },
    },
    {
      h: 'Diagnosing inconsistent behaviour with /memory',
      md: "When Claude \"sometimes\" follows a rule, the cause is usually that the rule was not in context, not a model weakness. Check before rewriting prompts:\n\n" +
        "1. Run **`/memory`**. The exam guide treats it as the way to verify which memory files are loaded. In the current docs it lists the user/project memory locations, opens any of them in your editor (creating missing ones) and toggles auto memory.\n" +
        "2. Run **`/context`**. Current docs point to its *Memory files* list as the authoritative view of what loaded at launch in this session.\n" +
        "3. Compare against where the instruction actually lives.",
      table: {
        headers: ['Symptom', 'Likely cause', 'Fix'],
        rows: [
          ['New teammate never gets a team rule', 'Rule is in the lead\'s `~/.claude/CLAUDE.md`', 'Move it to project CLAUDE.md or `.claude/rules/`, commit'],
          ['Rule followed only after Claude opened a file in `services/orders/`', 'Rule is in a subdirectory CLAUDE.md (on-demand)', 'Fine if folder-specific; else move it up to the root or a rule'],
          ['Works in one worktree, not another', 'It is in `CLAUDE.local.md`, which is per-worktree and git-ignored', 'Import a file from `~/` or promote to project scope'],
          ['Rule "forgotten" after `/compact`', 'It was only said in chat. The root CLAUDE.md is re-read after compaction, but conversation-only instructions are summarised away', 'Write it into CLAUDE.md'],
          ['Claude flips between two styles', 'Two loaded files contradict each other', 'Delete one. Concatenation does not pick a winner'],
          ['`@docs/style.md` ignored', 'Import was wrapped in backticks, or depth limit exceeded', 'Write the import as bare text; flatten the chain'],
        ],
      },
    },
  ],
  antiPatterns: [
    'Putting team-wide conventions in `~/.claude/CLAUDE.md` and expecting teammates to receive them.',
    'Growing one root CLAUDE.md to many hundreds of lines covering every package and topic instead of splitting into `.claude/rules/` files or package-level imports.',
    'Copy-pasting the same standards text into every package CLAUDE.md instead of keeping one file and `@import`ing it where relevant.',
    'Rewriting an instruction in capital letters or with stronger wording before checking with `/memory` (or `/context`) whether the file is even loaded.',
    'Relying on CLAUDE.md to enforce hard constraints such as never touching `.env`. Those need permission rules or hooks.',
    'Committing personal preferences (your sandbox URL, your editor habits) to the project CLAUDE.md where they affect everyone.',
  ],
  keyPoints: [
    'Guide hierarchy: user `~/.claude/CLAUDE.md` (personal, not in git) → project `./CLAUDE.md` or `.claude/CLAUDE.md` (shared) → subdirectory CLAUDE.md (folder-specific). Docs add a managed policy file and `CLAUDE.local.md`.',
    'Ancestor files load at launch; subdirectory files load on demand when Claude touches that subtree.',
    'Files are concatenated (broad → specific), not overridden, so contradictions must be removed by hand.',
    '`@path` imports keep CLAUDE.md modular. Paths resolve from the importing file, code spans are not imported, nesting is capped, and imports do not reduce token cost.',
    '`.claude/rules/` splits a monolith into topic files (testing.md, api-conventions.md, deployment.md). Without `paths:` they always load; with `paths:` they load conditionally.',
    'Use `/memory` (guide) and `/context` (docs) to verify which memory files are loaded before debugging prompts.',
    'CLAUDE.md shapes behaviour but does not enforce it. Use permissions or hooks for guarantees.',
  ],
  pitfalls: [
    'Launching Claude from a parent folder (e.g. `~/code`) so the repo\'s CLAUDE.md is a *subdirectory* file that loads only on demand.',
    'Assuming `CLAUDE.local.md` follows you across git worktrees. It is git-ignored and exists only where you created it.',
    'Mentioning a file as `` `@docs/x.md` `` inside backticks and wondering why it was not imported.',
    'Using `@imports` to "save context". Imported content loads at launch just like inline text.',
    'Leaving stale instructions for old frameworks in nested files. Audit periodically (newer builds offer `/doctor prompt-audit`).',
    'Forgetting that `.claude/rules/` files without `paths:` are always loaded, so splitting alone does not shrink the prompt.',
  ],
  realWorld: [
    'Monorepos commonly keep a thin root CLAUDE.md (repo map, build commands) plus per-package CLAUDE.md files that `@import` from a shared `standards/` folder.',
    'Platform teams assign CODEOWNERS to `.claude/rules/security.md` so AppSec must approve changes to the security instructions Claude follows.',
    'Enterprises deploy a managed CLAUDE.md with data-handling reminders via MDM, and back the hard rules with managed `permissions.deny` settings.',
    'Teams that also use other coding agents keep one `AGENTS.md` and put `@AGENTS.md` at the top of CLAUDE.md (newer Claude Code versions can read AGENTS.md directly).',
  ],
  related: ['cca-path-rules', 'cca-commands-skills', 'cca-plan-mode', 'cca-claude-code-ci', 'cca-codebase-context', 'cca-agent-sdk-hooks'],
  quiz: [
    {
      q: "Your tech lead added \"Use the internal `@acme/log` package; never call console.log\" to Claude Code six weeks ago and it works perfectly for her. Two contractors who joined this week say Claude keeps writing `console.log`. Their `/memory` output lists the repo's CLAUDE.md but nothing mentions logging. What is the most effective fix?",
      options: [
        'Ask the contractors to copy the tech lead\'s ~/.claude/CLAUDE.md onto their machines',
        'Move the instruction into the project CLAUDE.md (or a committed `.claude/rules/logging.md`) so every clone receives it',
        'Put the instruction in CLAUDE.local.md at the repo root',
        'Rephrase the rule in capital letters with "IMPORTANT" so the model weighs it more heavily',
      ],
      answer: 1,
      explain: "The rule lives in the lead's user-level file, which is never in version control. Committing it at project scope fixes it for everyone, permanently. Copying files by hand works today but drifts and has to be repeated for every new hire. CLAUDE.local.md is git-ignored and personal, so it has the same problem. Emphasis is pointless when the text is not loaded at all.",
    },
    {
      q: "A monorepo has `packages/payments`, `packages/web` and `packages/data-pipeline`. The root CLAUDE.md has grown to 950 lines mixing PCI rules, accessibility rules and Spark tuning advice, and adherence is slipping. Each package's maintainers know which shared standards apply to them. Which restructuring best fits?",
      options: [
        'Keep the single file but add a markdown heading per package so Claude can find the relevant part',
        'Create a short CLAUDE.md in each package that `@import`s only the relevant files from a shared `standards/` folder, and slim the root file to repo-wide basics',
        'Paste the relevant standards text directly into each package CLAUDE.md',
        'Turn every standard into a skill so developers invoke the ones they need',
      ],
      answer: 1,
      explain: "Per-package imports let maintainers choose the standards that apply, with one copy of each standard. Headings do not reduce what loads, so every session still pays for 950 lines of mostly irrelevant rules. Pasting copies creates drift the first time a standard changes. Skills are on-demand, so universal must-follow rules would be skipped whenever nobody remembers to invoke them.",
    },
    {
      q: "Your CLAUDE.md says: \"API style is documented in `@docs/api-style.md`.\" Claude never follows the API style, and `/context` shows the CLAUDE.md loaded but not api-style.md. What is the most likely cause?",
      options: [
        'Imports only work with absolute paths',
        'The import is inside a code span (backticks), so it is treated as literal text and not expanded',
        'Imports are only honoured in ~/.claude/CLAUDE.md',
        'Imported files must live inside the .claude/ directory',
      ],
      answer: 1,
      explain: "Import parsing skips code spans and fenced blocks so you can mention a path without importing it. Remove the backticks. Relative paths are fine (resolved from the importing file), imports work at every scope, and the imported file can live anywhere in the repo.",
    },
    {
      q: "The root CLAUDE.md is 700 lines. QA, AppSec and SRE each edit their own sections, and every week there are merge conflicts and contradictory edits nobody reviews. You want separate ownership without changing which instructions apply. What should you do?",
      options: [
        'Split the sections into `.claude/rules/testing.md`, `security.md` and `deployment.md` and give each a CODEOWNERS entry',
        'Move each team\'s section into that team lead\'s ~/.claude/CLAUDE.md',
        'Scatter the sections into CLAUDE.md files in random subdirectories so they are smaller',
        'Convert each section into a slash command the team runs when relevant',
      ],
      answer: 0,
      explain: "Rule files without `paths:` load just like the CLAUDE.md content did, so behaviour is unchanged. Each topic becomes its own reviewable, ownable file. User-level files would stop applying to everyone else. Subdirectory files would load only when Claude happens to touch those folders, which changes behaviour. Commands only run when someone invokes them.",
    },
    {
      q: "A developer wants Claude to use their personal staging URL and test account when working in this repo, and nothing they add should affect teammates or other repositories. Where should it go?",
      options: [
        'The project CLAUDE.md, in a section labelled "Personal"',
        'A committed `.claude/rules/my-settings.md`',
        'CLAUDE.local.md at the repo root, listed in .gitignore',
        'The managed policy CLAUDE.md',
      ],
      answer: 2,
      explain: "CLAUDE.local.md is the project-scoped personal file. It loads alongside CLAUDE.md but is git-ignored. Anything committed (the project CLAUDE.md or a rules file) reaches every teammate. The managed policy file applies to every user and repo on the machine. If the preference should apply to all of the developer's projects, `~/.claude/CLAUDE.md` would be the choice instead.",
    },
    {
      q: "Developers say Claude follows the order-service migration conventions \"about half the time\". The conventions are in `services/orders/CLAUDE.md`. Sessions are started at the repo root, and the failures happen when someone asks Claude to draft a migration plan before it has opened any file. What explains this, and what is the best change?",
      options: [
        'Subdirectory CLAUDE.md files load on demand when Claude touches that folder. Move rules that must apply before any file is read into the root CLAUDE.md or an unconditional `.claude/rules/` file',
        'The model is non-deterministic, so lower the temperature',
        'Subdirectory CLAUDE.md files are never read, so they must be deleted',
        'CLAUDE.md files have a 50-line limit and the extra lines were truncated',
      ],
      answer: 0,
      explain: "Files below the working directory are discovered when Claude reads or edits something in that subtree. Before that, the conventions are not in context, which matches the \"half the time\" pattern. Temperature does not fix missing context. Subdirectory files are read, just later. There is no 50-line truncation (the docs only *recommend* keeping files concise).",
    },
    {
      q: "AppSec requires that Claude Code must never read or modify `secrets/*.env` in any repository on company laptops. Someone proposes adding that sentence to the managed policy CLAUDE.md. What is the best assessment?",
      options: [
        'Sufficient. Managed CLAUDE.md cannot be excluded, so the rule is enforced',
        'Useful as guidance, but the guarantee needs managed permission deny rules (or a hook). CLAUDE.md is context, not enforcement',
        'Put it in each developer\'s ~/.claude/CLAUDE.md instead because user files take precedence',
        'Add it to every project\'s CLAUDE.local.md',
      ],
      answer: 1,
      explain: "Memory files shape behaviour but cannot guarantee it, because the model can still misread or be manipulated into ignoring them. Managed settings such as `permissions.deny` are enforced by the client no matter what the model decides. User files do not outrank managed ones (all files are concatenated), and CLAUDE.local.md is personal and uncontrolled.",
    },
  ],
  references: [
    { title: 'Claude Code docs: How Claude remembers your project (CLAUDE.md, imports, rules)', url: 'https://code.claude.com/docs/en/memory' },
    { title: 'Claude Code docs: Settings and managed settings', url: 'https://code.claude.com/docs/en/settings' },
    { title: 'Claude Code docs: Monorepos and large codebases', url: 'https://code.claude.com/docs/en/large-codebases' },
    { title: 'Anthropic: Claude Code best practices', url: 'https://www.anthropic.com/engineering/claude-code-best-practices' },
    { title: 'Claude Certified Architect – Foundations exam guide', url: 'https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification' },
  ],
});
