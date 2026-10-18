SD.concept({
  id: 'cca-commands-skills',
  category: 'cca',
  domain: 3,
  tasks: ['3.2'],
  order: 2,
  icon: '🧰',
  title: 'Custom Slash Commands & Skills',
  tagline: 'Package repeatable workflows as /commands and SKILL.md files: share them through git, isolate noisy ones with context: fork, and keep always-true rules in CLAUDE.md.',
  summary:
    "A **custom slash command** is a markdown prompt saved as a file, and typing `/name` runs it. Put it in **`.claude/commands/`** and it is committed with the repo, so every teammate gets `/name` after `git pull`. Put it in **`~/.claude/commands/`** and it is yours alone, in every project.\n\n" +
    "A **skill** is the richer form: a folder under **`.claude/skills/<name>/`** (or `~/.claude/skills/` for personal ones) containing a `SKILL.md` with YAML frontmatter plus optional supporting files and scripts. Frontmatter controls how it runs. **`context: fork`** runs it in an isolated sub-agent so verbose output never floods your main conversation. **`allowed-tools`** governs which tools it uses. **`argument-hint`** tells the developer what parameter to type. In current Claude Code, commands and skills have been merged: both create `/name`, command files keep working, and a skill wins if both share a name.\n\n" +
    "The key design choice: **skills load on demand** (only a short description sits in context until invoked), while **CLAUDE.md is always loaded**. Universal standards go in CLAUDE.md. Task-specific procedures (\"cut a release\", \"audit dependencies\", \"map this module\") go in skills.",
  analogy:
    "CLAUDE.md is the house rules poster on the wall: everyone sees it all the time. A skill is a recipe card in a drawer. It stays out of the way until someone says \"let's make the lasagne\", and only then do you pull it out. Team recipe cards live in the shared kitchen drawer (`.claude/skills/`). Your personal twists go in your own notebook (`~/.claude/skills/`) under a different name, so the next cook does not get your extra-spicy version by surprise. A forked skill is sending a helper to the pantry to inventory 400 jars. You want back \"we're out of basil\", not the full list.",
  diagram: {
    intro: 'Typing `/name` (or Claude deciding a skill is relevant) resolves to a command or skill file. Inline skills run in the main conversation. `context: fork` skills run in a separate sub-agent and hand back only a summary.',
    nodes: [
      { id: 'dev', label: 'Developer', sub: 'types /name args', type: 'client', col: 0, row: 2, desc: 'Invokes a command or skill explicitly with `/name`, optionally with arguments. The `/` menu shows each entry\'s description and `argument-hint`.' },
      { id: 'menu', label: 'Slash resolver', sub: 'name → file', type: 'gateway', col: 1, row: 2, desc: 'Finds the file behind `/name`. Commands and skills share one namespace. On a name clash a skill beats a command file, and per current docs enterprise beats personal, which beats project. Plugin skills are namespaced as `/plugin:name`.' },
      { id: 'projcmd', label: '.claude/commands/', sub: 'project, in git', type: 'storage', col: 2, row: 0, desc: 'Single-file project commands, e.g. `.claude/commands/release-notes.md` → `/release-notes`. Committed, so the whole team gets them. Subfolders namespace them: `frontend/component.md` → `/frontend:component`.' },
      { id: 'usercmd', label: '~/.claude/commands/', sub: 'personal', type: 'storage', col: 2, row: 1, desc: 'Personal commands available in every project on your machine and invisible to teammates.' },
      { id: 'projskill', label: '.claude/skills/', sub: 'name/SKILL.md, in git', type: 'storage', col: 2, row: 3, desc: 'Project skills: a directory per skill with `SKILL.md` (frontmatter + instructions) plus optional reference docs and scripts that load only when referenced.' },
      { id: 'userskill', label: '~/.claude/skills/', sub: 'personal variants', type: 'storage', col: 2, row: 4, desc: 'Personal skills. The right place for your own variant of a team workflow, saved under a *different name* (e.g. `review-strict`) so the shared `/review` stays intact and visible.' },
      { id: 'claudemd', label: 'CLAUDE.md', sub: 'always loaded', type: 'storage', col: 3, row: 0, desc: 'Universal standards that should apply to every task. Unlike skills, it is in context from the first message whether or not anyone asks for it.' },
      { id: 'main', label: 'Main conversation', sub: 'your session context', type: 'ml', col: 3, row: 2, desc: 'Holds skill *descriptions* (so Claude knows what exists) and the full body of any inline skill once invoked. That body stays in context for later turns.' },
      { id: 'fork', label: 'Forked sub-agent', sub: 'context: fork', type: 'worker', col: 4, row: 3, desc: 'A fresh sub-agent whose prompt is the skill body. It does not see your conversation history. It does the noisy work in its own context window and returns a summary. The `agent:` field picks its type (default general-purpose).' },
      { id: 'tools', label: 'Tools', sub: 'allowed-tools', type: 'service', col: 5, row: 3, desc: 'Read, Grep, Write, Bash and so on. The guide describes `allowed-tools` as restricting what a skill may use. Current docs say it *pre-approves* listed tools for that turn, and you use `disallowed-tools` or permission rules to actually remove tools.' },
    ],
    edges: [
      { from: 'dev', to: 'menu', label: '/name' },
      { from: 'menu', to: 'projcmd' },
      { from: 'menu', to: 'usercmd' },
      { from: 'menu', to: 'projskill' },
      { from: 'menu', to: 'userskill' },
      { from: 'menu', to: 'main', label: 'inline body' },
      { from: 'claudemd', to: 'main', label: 'every session' },
      { from: 'main', to: 'fork', label: 'spawn' },
      { from: 'fork', to: 'tools', both: true },
      { from: 'fork', to: 'main', label: 'summary', curve: 0.3 },
    ],
    flows: [
      {
        id: 'team-command', name: 'A team command shared through git',
        steps: [
          { at: 'projcmd', text: 'A lead commits `.claude/commands/release-notes.md`: "Summarise merged PRs since tag $ARGUMENTS into user-facing release notes."' },
          { from: 'dev', to: 'menu', text: 'After `git pull`, any teammate types `/release-notes v2.4.0`.' },
          { from: 'menu', to: 'projcmd', text: 'The resolver finds the project command, so no personal setup is needed.' },
          { from: 'menu', to: 'main', text: 'The prompt body, with `$ARGUMENTS` replaced by `v2.4.0`, enters the main conversation.' },
          { at: 'main', text: 'Claude reads the git log and drafts notes, following the always-loaded CLAUDE.md style rules.' },
        ],
      },
      {
        id: 'forked', name: 'Verbose analysis isolated with context: fork',
        steps: [
          { from: 'dev', to: 'menu', text: '`/map-deps packages/orders`, a skill that inventories every import and call site.' },
          { from: 'menu', to: 'projskill', text: 'SKILL.md has `context: fork`, `agent: Explore` and `allowed-tools: Read, Grep, Glob`.' },
          { from: 'main', to: 'fork', text: 'A sub-agent starts with the skill body as its task. It has no chat history and its own context window.' },
          { from: 'fork', to: 'tools', text: 'It greps and reads ~180 files. That 90K tokens of raw output stays inside the fork.' },
          { from: 'fork', to: 'main', text: 'Only a ~600-token summary returns: 4 entry points, 2 circular dependencies, 1 dead module.' },
          { at: 'main', text: 'The main session keeps its working context for the actual refactor.' },
        ],
      },
      {
        id: 'argument', name: 'Missing argument caught by argument-hint',
        steps: [
          { from: 'dev', to: 'menu', text: 'A developer types `/hotfix` and pauses.' },
          { at: 'menu', text: 'The menu shows `/hotfix [ticket-id] [base-branch]` from the `argument-hint` frontmatter.' },
          { from: 'dev', to: 'menu', text: 'They complete it as `/hotfix PAY-1182 release/2.3`.' },
          { from: 'menu', to: 'main', text: '`$0` = PAY-1182 and `$1` = release/2.3 are substituted into the skill body.' },
          { at: 'main', text: 'Claude creates `hotfix/PAY-1182` from the right base instead of guessing.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Where commands and skills live (and who gets them)',
      md: "Scope works exactly like CLAUDE.md: anything under the repo's `.claude/` is shared through version control, and anything under `~/.claude/` is personal.",
      table: {
        headers: ['Kind', 'Location', 'Invoked as', 'Shared?', 'Use for'],
        rows: [
          ['Project command', '`.claude/commands/deploy-preview.md`', '`/deploy-preview`', 'Yes, via git', 'Simple team prompts'],
          ['Personal command', '`~/.claude/commands/standup.md`', '`/standup`', 'No', 'Your own shortcuts'],
          ['Project skill', '`.claude/skills/audit-deps/SKILL.md` (+ files)', '`/audit-deps` or auto', 'Yes, via git', 'Team workflows with config, scripts, references'],
          ['Personal skill', '`~/.claude/skills/review-strict/SKILL.md`', '`/review-strict` or auto', 'No', 'Personal variants under a *different* name'],
          ['Plugin skill', '`<plugin>/skills/x/SKILL.md`', '`/plugin:x`', 'Wherever enabled', 'Distributing across many repos'],
        ],
      },
      callout: { type: 'warn', md: "**Personal variants:** never edit the committed `.claude/skills/review/` to suit your taste, because that changes it for the whole team. Copy it to `~/.claude/skills/review-strict/` with a new name. Reusing the *same* name is also a bad idea: per current docs a personal skill shadows a project skill of the same name in your sessions, so you would silently stop seeing the team's updates, and \"/review\" would mean different things to different people." },
    },
    {
      h: 'Anatomy of a SKILL.md',
      md: ["```", "# .claude/skills/map-deps/SKILL.md", "---", "name: map-deps", "description: Map imports, call sites and cycles for one package. Use before", "  refactoring or splitting a module.", "argument-hint: \"[package-path]\"", "context: fork            # run in an isolated sub-agent", "agent: Explore           # read-only built-in agent type", "allowed-tools: Read, Grep, Glob", "---", "Analyse the package at $ARGUMENTS.", "", "1. List every public export and where it is imported (file:line).", "2. Detect circular imports.", "3. Flag modules with zero inbound imports.", "", "Return ONLY a summary: entry points, cycles, dead modules, top 5 risks.", "Do not paste file contents.", "```"].join("\n") + "\n\n" +
        "Frontmatter fields the exam focuses on, plus the related ones from the docs:",
      table: {
        headers: ['Field', 'What it does', 'Typical use'],
        rows: [
          ['`context: fork`', 'Runs the skill body as the prompt of a **new sub-agent** with its own context. No chat history goes in, and a summary comes out.', 'Codebase analysis, brainstorming alternatives, anything verbose or exploratory'],
          ['`agent`', 'Sub-agent type for the fork (`Explore`, `Plan`, `general-purpose`, or a custom agent)', 'Read-only research → `Explore`'],
          ['`allowed-tools`', 'Guide: restricts the tools available during the skill. Current docs: **pre-approves** the listed tools (no prompts) for the invoking turn. It does not remove other tools', 'Read/Write-only scaffolding; `Bash(git log *)` for a changelog skill'],
          ['`disallowed-tools`', '(Docs) removes tools from the pool while the skill runs', 'Hard "no Bash" for a file-generation skill'],
          ['`argument-hint`', 'Shown in the `/` menu and autocomplete, e.g. `[ticket-id] [env]`, so people supply required parameters', 'Any skill that needs input'],
          ['`description`', 'What it does and **when to use it**. Claude reads this to decide whether to auto-invoke', 'Put the trigger condition first'],
          ['`disable-model-invocation`', '`true` means only a human can run it (its description is not even loaded)', 'Deploys, anything with side effects'],
        ],
      },
    },
    {
      h: 'context: fork in practice',
      md: "Without `fork`, an invoked skill's body and everything it produces (tool results, file dumps, a 40-item brainstorm) land in your main conversation and **stay there**. A dependency map that reads 150 files can burn most of a context window before the real work starts, and later answers degrade as the context fills with stale detail.\n\n" +
        "With `context: fork` the skill runs as a sub-agent:\n\n" +
        "- It starts with **only the skill body** as its task (plus that agent type's startup context), not your conversation history, so the instructions must be self-contained.\n" +
        "- Its tool calls and outputs live in **its own** context window.\n" +
        "- It returns a **summary** to the main session. Current docs say forked skills run in the background by default and post the result when done, and `background: false` makes the invoking turn wait.\n\n" +
        "Use it for **verbose output** (code inventories, log digests, test-coverage scans) and **exploratory work** (\"brainstorm five caching strategies and rank them\") where you want the conclusion, not the scratch work. Do **not** fork a skill that is only guidelines (\"follow our API conventions\"): the sub-agent receives guidance but no task and returns nothing useful. Do not fork one that needs the current conversation either.",
      callout: { type: 'good', md: 'Rule of thumb: if you would say "just tell me what you found", fork it. If the skill must edit files in the flow of your current task using what you just discussed, keep it inline.' },
    },
    {
      h: 'Skill or CLAUDE.md?',
      md: "Both are instructions to Claude, but they have opposite loading models:\n\n" +
        "- **CLAUDE.md** loads in every session, whether or not it is relevant. Put **universal standards** there: build commands, naming conventions, \"money is integer cents\".\n" +
        "- A **skill** costs only its description until it is invoked, by you typing `/name` or by Claude matching the description. Put **task-specific workflows** there: release checklists, migration recipes, incident write-up templates, multi-step audits.\n\n" +
        "A good smell test from the docs: if a CLAUDE.md section has grown from a *fact* into a *procedure*, or you keep pasting the same checklist into chat, make it a skill. Conversely, a rule that must hold for every edit does not belong in a skill, because nobody will invoke it at the right moment.",
      table: {
        headers: ['Instruction', 'Best home', 'Why'],
        rows: [
          ['"Use pnpm, never npm"', 'CLAUDE.md', 'Applies to every task'],
          ['14-step quarterly dependency audit', 'Skill (`/audit-deps`)', 'Rare, long, procedural'],
          ['"All SQL migrations must be reversible"', 'Path-scoped rule (`paths: migrations/**`)', 'Always true, but only for some files'],
          ['Generate an ADR from a template', 'Skill with `argument-hint: [decision-title]`', 'On demand, needs input'],
          ['Inventory all feature flags in the codebase', 'Skill with `context: fork`', 'Verbose; you only want the summary'],
        ],
      },
    },
  ],
  antiPatterns: [
    'Keeping a team workflow in `~/.claude/commands/` and telling teammates to "ask me for the file" instead of committing it to `.claude/commands/` or `.claude/skills/`.',
    'Editing the shared project skill to match personal taste instead of creating a personal variant with a different name in `~/.claude/skills/`.',
    'Running a verbose codebase-analysis skill inline so thousands of lines of tool output pollute the main conversation, instead of `context: fork`.',
    'Putting a long, rarely used procedure in CLAUDE.md (paying for it every session) or putting a universal rule in a skill (applied only when someone remembers).',
    'Relying on prose like "please do not run shell commands" inside a skill instead of configuring its tool access in frontmatter (and permissions).',
    'Forking a skill that only contains guidelines and no task, so the sub-agent returns nothing.',
  ],
  keyPoints: [
    '`.claude/commands/` = project-scoped, shared via git. `~/.claude/commands/` = personal. The same split applies to `.claude/skills/` vs `~/.claude/skills/`.',
    'Skills are directories with `SKILL.md` (YAML frontmatter + instructions) and optional supporting files. Commands and skills are now merged and both create `/name`.',
    '`context: fork` runs the skill in an isolated sub-agent and returns a summary. Use it for verbose or exploratory skills.',
    '`allowed-tools` controls tool access for the skill. The guide calls it a restriction; current docs call it a pre-approval and use `disallowed-tools` or permissions for removal.',
    '`argument-hint` shows developers which parameters to pass. `$ARGUMENTS`, `$0`, `$1` substitute them.',
    'Personal variants go in `~/.claude/skills/` under a different name so teammates and the shared version are unaffected.',
    'Skills = on-demand, task-specific. CLAUDE.md = always loaded, universal.',
  ],
  pitfalls: [
    'Writing a vague `description` ("helps with code"), so Claude never auto-invokes the skill or invokes it at the wrong times.',
    'Assuming a forked skill sees what you just discussed. It does not, so pass what it needs as arguments or write it into the body.',
    'Leaving side-effecting skills (deploy, publish) auto-invocable. Set `disable-model-invocation: true`.',
    'Huge SKILL.md files. Keep the core under a few hundred lines and move reference material into supporting files loaded only when needed.',
    'Forgetting that an inline skill\'s body stays in the conversation after it finishes, so repeated inline runs of big skills add up.',
    'A command and a skill with the same name: the skill wins, and the command silently stops running.',
  ],
  realWorld: [
    'Teams commit `/pr-description`, `/release-notes` and `/oncall-handoff` as project commands so every engineer gets the same output format.',
    'Platform teams ship a `/new-service` skill with a templates folder and a scaffold script, and gate it with `disable-model-invocation: true`.',
    'Read-only analysis skills (`/coverage-gaps`, `/flag-inventory`) use `context: fork` with the Explore agent to keep the main session lean.',
    'Organisations distribute common skills to many repos as plugins (namespaced `/plugin:skill`) instead of copying folders around.',
  ],
  related: ['cca-claude-md', 'cca-path-rules', 'cca-plan-mode', 'cca-subagent-context', 'cca-builtin-tools', 'cca-context-preservation'],
  quiz: [
    {
      q: "Your team's shared `/review` skill in `.claude/skills/review/` checks style and tests. You personally also want it to flag every TODO and require docstrings, but teammates find that noisy. What is the best approach?",
      options: [
        'Edit `.claude/skills/review/SKILL.md` and add the extra checks behind a comment saying "optional"',
        'Copy it to `~/.claude/skills/review-strict/` with a new name and add your checks there',
        'Create `~/.claude/skills/review/` with the same name so it replaces the team version only for you',
        'Add the extra checks to the project CLAUDE.md so they apply during reviews',
      ],
      answer: 1,
      explain: "A personal skill with a distinct name leaves the shared one untouched and keeps both available to you. Editing the committed skill changes it for everyone. A same-named personal copy shadows the team skill in your sessions, so you would silently miss the team's future fixes and \"/review\" would mean different things to different people. CLAUDE.md would apply the noisy checks to the whole team in every session.",
    },
    {
      q: "A `/flag-inventory` skill greps the monorepo for feature-flag usages and lists every hit with surrounding code. After running it, developers notice Claude's later answers in the same session get vague and it \"forgets\" earlier decisions. What change best addresses this?",
      options: [
        'Add `context: fork` so the inventory runs in an isolated sub-agent and only a summary returns to the main conversation',
        'Ask developers to run `/compact` after every inventory',
        'Move the inventory instructions into CLAUDE.md',
        'Add `argument-hint` so developers scope the search',
      ],
      answer: 0,
      explain: "The skill's verbose output lands in the main context and crowds out earlier material. Forking keeps the raw grep results in a separate context window. `/compact` is a lossy after-the-fact clean-up that also squashes the decisions you wanted to keep. CLAUDE.md would load the procedure in every session and does nothing for output volume. Scoping arguments help a little but do not isolate the output.",
    },
    {
      q: "A `/scaffold-endpoint` skill should only read existing files and write new ones. Last week it ran a database reset command through Bash while \"checking\" things. What is the most appropriate configuration change?",
      options: [
        'Add "Never run shell commands" to the top of the skill body',
        'Configure the skill\'s tool access in frontmatter: `allowed-tools` limited to Read, Glob and Write (in current builds, also list Bash under `disallowed-tools`)',
        'Set `disable-model-invocation: true`',
        'Set `context: fork` so the Bash call happens in a sub-agent',
      ],
      answer: 1,
      explain: "Tool access belongs in configuration, not prose. The exam frames `allowed-tools` as limiting what the skill can do. Current docs clarify that `allowed-tools` pre-approves tools and `disallowed-tools` (or a permission deny rule) actually removes Bash. A sentence in the body is a soft request. `disable-model-invocation` only stops Claude from auto-starting the skill. A fork isolates context but still runs the destructive command.",
    },
    {
      q: "Developers often type `/hotfix` with no arguments. The skill then guesses a ticket and branches from `main` instead of the release branch. What is the most direct improvement?",
      options: [
        'Add `argument-hint: "[ticket-id] [release-branch]"` and reference `$0`/`$1` in the body, stopping to ask if either is missing',
        'Add a paragraph about hotfix branching to CLAUDE.md',
        'Run the skill with `context: fork` so it has a clean context',
        'Rename it to `/hotfix-with-ticket-and-branch`',
      ],
      answer: 0,
      explain: "`argument-hint` shows the required parameters in the `/` menu and autocomplete, and positional substitution puts them exactly where the instructions need them. CLAUDE.md does not prompt for input at invocation time. Forking does not supply missing data. A long name is a clumsy, unstructured hint.",
    },
    {
      q: "Which split of instructions between CLAUDE.md and skills is best?",
      options: [
        'Everything in CLAUDE.md so Claude always knows it',
        'Everything in skills so context stays small',
        'CLAUDE.md: "use pnpm", "money is integer cents". Skills: the 12-step release checklist and the ADR generator',
        'CLAUDE.md: the release checklist. Skills: "use pnpm"',
      ],
      answer: 2,
      explain: "Universal, always-true standards belong in the always-loaded CLAUDE.md. Long, occasional procedures belong in on-demand skills. Putting everything in CLAUDE.md pays for rare procedures in every session and lowers adherence. Putting universal rules in skills means they apply only when someone invokes them. The last option is inverted.",
    },
    {
      q: "Someone created a forked skill `/api-style` whose body is just a list of API conventions (naming, pagination, error shapes). Invoking it returns almost nothing and Claude's next edit ignores the conventions. Why, and what is the fix?",
      options: [
        'Forked skills cannot read files. Add `allowed-tools: Read`',
        'A forked skill gives its body to a sub-agent as a task. Guidelines with no task produce no useful result and never reach the main conversation. Put the conventions in CLAUDE.md or a path-scoped rule, or make the skill inline',
        'The skill needs `argument-hint`',
        'Forked skills only work in headless mode',
      ],
      answer: 1,
      explain: "Forking is for skills with explicit work to do. Reference guidance must be in the context where edits happen. Since API conventions apply to every API edit, a path-scoped rule (or CLAUDE.md) is the right home. Tool access and argument hints do not create a task. Forked skills work interactively too.",
    },
  ],
  references: [
    { title: 'Claude Code docs: Extend Claude with skills', url: 'https://code.claude.com/docs/en/skills' },
    { title: 'Claude Code docs: Built-in and custom commands', url: 'https://code.claude.com/docs/en/commands' },
    { title: 'Claude Code docs: Subagents (agent types used by context: fork)', url: 'https://code.claude.com/docs/en/sub-agents' },
    { title: 'Claude Code docs: Permissions and permission rule syntax', url: 'https://code.claude.com/docs/en/permissions' },
    { title: 'Anthropic: Equipping agents for the real world with Agent Skills', url: 'https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills' },
  ],
});
