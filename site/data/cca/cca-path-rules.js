SD.concept({
  id: 'cca-path-rules',
  category: 'cca',
  domain: 3,
  tasks: ['3.3'],
  order: 3,
  icon: '🎯',
  title: 'Path-Specific Rules (paths: globs)',
  tagline: 'Load a convention only when Claude touches a file it applies to, whether that file is in one folder or spread across the entire codebase.',
  summary:
    "A file in **`.claude/rules/`** normally loads in every session. Add YAML frontmatter with a **`paths:`** list of glob patterns and it becomes **conditional**: it enters the context only when Claude reads, writes or edits a file whose path matches. A `terraform.md` with `paths: [\"terraform/**/*\"]` costs nothing during a React bug fix, then appears the moment Claude opens `terraform/modules/vpc/main.tf`.\n\n" +
    "That gives you two wins. You **spend fewer tokens**, because a repo with ten 1,500-token rule files does not pay ~15K tokens on every request. You also get **less irrelevant noise**, since Claude is not trying to reconcile Terraform tagging rules with a CSS change.\n\n" +
    "Globs match by **file type regardless of folder**, which a subdirectory CLAUDE.md cannot do. A pattern like `**/*.test.tsx` covers test files colocated in 200 component folders with one rule, where the directory approach would need 200 copies. Use subdirectory CLAUDE.md for \"everything inside this folder\" and path-scoped rules for \"every file of this kind, wherever it lives\".",
  analogy:
    "A subdirectory CLAUDE.md is a sign on a *room* door: you read it when you walk into that room. A path-scoped rule is a label on a *kind of object*, like the \"handle with gloves\" sticker on every chemical bottle in the building. Bottles sit in the lab, the storeroom and the janitor's closet, and the sticker travels with the bottle. Putting a door sign on every room that might hold a bottle would be both wasteful and easy to forget.",
  diagram: {
    intro: 'Each file access is checked against the `paths:` globs of every conditional rule. Only matching rules join the context. Unconditional rules (no `paths:`) were already loaded at launch.',
    nodes: [
      { id: 'dev', label: 'Developer', sub: 'asks for a change', type: 'client', col: 0, row: 2, desc: 'Describes the task. Which files Claude ends up touching, and therefore which rules load, follows from the request.' },
      { id: 'session', label: 'Claude session', sub: 'agent loop', type: 'ml', col: 1, row: 2, desc: 'Plans and calls tools. It starts with CLAUDE.md files and unconditional rules only.' },
      { id: 'always', label: 'code-style.md', sub: 'no paths: always on', type: 'storage', col: 1, row: 0, desc: 'A rule file without `paths:` frontmatter. It loads at launch with the same priority as `.claude/CLAUDE.md`. Use this for rules that must hold before any file is opened.' },
      { id: 'tool', label: 'Read / Write / Edit', sub: 'file access', type: 'service', col: 2, row: 2, desc: 'File tools (and single-file `cat`/`head` reads) are the trigger. The path being accessed is what gets matched.' },
      { id: 'matcher', label: 'Glob matcher', sub: 'path vs paths:', type: 'gateway', col: 3, row: 2, desc: 'Compares the accessed path (relative to the project) with each rule\'s patterns: `**` spans directories, `*` stays within one segment, and `{ts,tsx}` brace expansion is supported.' },
      { id: 'rtest', label: 'testing.md', sub: '**/*.test.{ts,tsx}', type: 'storage', col: 4, row: 0, desc: 'Test conventions for test files colocated across the whole repo: arrange-act-assert, factories over raw fixtures, no snapshot tests for logic.' },
      { id: 'rtf', label: 'terraform.md', sub: 'terraform/**/*', type: 'storage', col: 4, row: 1, desc: 'Infrastructure conventions: required tags, module pinning, no inline IAM policies. Irrelevant to app code, so it should never load during a UI task.' },
      { id: 'rmig', label: 'migrations.md', sub: '**/migrations/*.sql', type: 'storage', col: 4, row: 3, desc: 'Migration rules that apply in every service\'s own `migrations/` folder: always reversible, no table locks on large tables, backfill in batches.' },
      { id: 'rapi', label: 'api.md', sub: 'src/api/**/*.ts', type: 'storage', col: 4, row: 4, desc: 'HTTP handler conventions such as input validation, the error envelope and OpenAPI comments, scoped to a single tree.' },
      { id: 'context', label: 'Context window', sub: 'only relevant rules', type: 'ml', col: 5, row: 2, desc: 'Accumulates the rules that matched during this session. Once loaded, a rule stays for the rest of the conversation. After `/compact`, path rules reload on demand the next time a matching file is touched.' },
    ],
    edges: [
      { from: 'dev', to: 'session', label: 'task' },
      { from: 'always', to: 'session', label: 'at launch' },
      { from: 'session', to: 'tool', label: 'open file' },
      { from: 'tool', to: 'matcher', label: 'path' },
      { from: 'matcher', to: 'rtest' },
      { from: 'matcher', to: 'rtf' },
      { from: 'matcher', to: 'rmig' },
      { from: 'matcher', to: 'rapi' },
      { from: 'rtest', to: 'context', async: true },
      { from: 'rtf', to: 'context', async: true },
      { from: 'rmig', to: 'context', async: true },
      { from: 'rapi', to: 'context', async: true },
    ],
    flows: [
      {
        id: 'test-file', name: 'Fixing a test colocated deep in the UI',
        steps: [
          { from: 'dev', to: 'session', text: '"The date-picker test is flaky, fix it."' },
          { from: 'always', to: 'session', text: 'Only CLAUDE.md and code-style.md are in context so far, about 2K tokens of instructions.' },
          { from: 'session', to: 'tool', text: 'Claude opens apps/web/src/components/DatePicker/DatePicker.test.tsx.' },
          { from: 'tool', to: 'matcher', text: 'The path is checked against every conditional rule.' },
          { from: 'matcher', to: 'rtest', text: '`**/*.test.{ts,tsx}` matches, even though no test folder exists. The rule follows the file type.' },
          { from: 'rtest', to: 'context', text: 'Testing conventions join the context: use fake timers, avoid real dates.' },
          { at: 'context', text: 'terraform.md, migrations.md and api.md never load, which saves roughly 4–5K tokens on every later request in this session.' },
        ],
      },
      {
        id: 'terraform', name: 'Infra change in the same repo',
        steps: [
          { from: 'dev', to: 'session', text: '"Add a read replica to the orders database."' },
          { from: 'session', to: 'tool', text: 'Claude reads terraform/envs/prod/orders-db.tf.' },
          { from: 'tool', to: 'matcher', text: 'Matched against `terraform/**/*`.' },
          { from: 'matcher', to: 'rtf', text: 'terraform.md matches.' },
          { from: 'rtf', to: 'context', text: 'Tagging and module-pinning rules load before Claude writes the new resource.' },
          { from: 'session', to: 'tool', text: 'Claude then edits services/orders/migrations/0042_add_index.sql for a supporting index.' },
          { from: 'matcher', to: 'rmig', text: '`**/migrations/*.sql` matches too, so the reversible-migration rule loads.' },
          { from: 'rmig', to: 'context', text: 'Both domains\' rules are now present, and only because both kinds of file were touched.' },
        ],
      },
      {
        id: 'broken-yaml', name: 'Gotcha: unquoted glob makes a rule always-on',
        steps: [
          { at: 'rmig', text: 'Someone writes `paths: **/migrations/*.sql` without quotes.' },
          { at: 'matcher', text: 'In YAML a leading `*` starts an alias, so the frontmatter fails to parse.' },
          { from: 'rmig', to: 'context', text: 'Claude Code ignores unparseable frontmatter and loads the rule as if it had no `paths:` at all, in every session.' },
          { from: 'dev', to: 'session', text: 'A front-end developer wonders why Claude mentions table locks while editing CSS.' },
          { at: 'rmig', text: 'Fix: quote the pattern, `paths: ["**/migrations/*.sql"]`. Running `claude --debug` shows the parse error.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Writing a path-scoped rule',
      md: "Frontmatter goes between `---` markers on the first line of a `.claude/rules/*.md` file. `paths` is the **only** field Claude Code reads from a rule file (anything else is ignored), and it accepts a YAML list or a comma-separated string. **Quote your globs**, because a pattern that starts with `*` is not valid unquoted YAML.\n\n" +
        ["```", "# .claude/rules/testing.md", "---", "paths:", "  - \"**/*.test.ts\"", "  - \"**/*.test.tsx\"", "  - \"**/__tests__/**\"", "---", "# Testing conventions", "- Arrange / act / assert blocks separated by blank lines.", "- Build data with factories in test/factories/, never inline 40-line objects.", "- Use fake timers for anything date- or timeout-related.", "- No snapshot tests for business logic; assert on values.", "```", "", "```", "# .claude/rules/terraform.md", "---", "paths: [\"terraform/**/*\", \"**/*.tf\"]", "---", "- Every resource carries the `owner`, `cost-center` and `env` tags.", "- Pin module versions; never reference a module by branch.", "- IAM policies live in iam/ as documents, never inline.", "```"].join("\n"),
      table: {
        headers: ['Pattern', 'Matches', 'Does not match'],
        rows: [
          ['`**/*.test.tsx`', 'Any `.test.tsx` file at any depth', '`Button.tsx`, `Button.spec.tsx`'],
          ['`terraform/**/*`', 'Everything under `terraform/` at the project root', '`services/x/terraform/main.tf` (different root)'],
          ['`**/*.tf`', 'Every Terraform file anywhere', '`.tfvars` files (add `**/*.tfvars`)'],
          ['`src/api/**/*.ts`', 'TS files anywhere under `src/api/`', '`src/web/api.ts`'],
          ['`src/**/*.{ts,tsx}`', 'TS and TSX under `src/` (brace expansion)', '`.js` files'],
          ['`*.md`', 'Markdown in the project root only', '`docs/guide.md` (use `**/*.md`)'],
        ],
      },
    },
    {
      h: 'Why conditional loading matters',
      md: "Rules without `paths:` and CLAUDE.md content are sent with **every** request in the session. Say a platform team has written eight topic files averaging 1,400 tokens each (~11K tokens). A front-end developer fixing a button pays for all eight on every turn: 30 turns × 11K = **330K input tokens** of mostly irrelevant instructions (prompt caching reduces the price, not the noise). Scope them with `paths:` and that session might load just `testing.md` and `react.md` at ~2.8K.\n\n" +
        "Token cost is only half of it. Instructions compete for attention, so a prompt full of Terraform, Kafka and SQL rules during a CSS change leaves more room for confusion and contradictions. Conditional rules keep the context **relevant**, and relevance is what drives adherence.\n\n" +
        "Loading mechanics from the docs:\n\n" +
        "- A path rule loads when Claude **reads, writes or edits** a matching file (including a single-file `cat`/`head`).\n" +
        "- Once loaded, it stays in the conversation. After `/compact`, it loads again the next time a matching file is touched.\n" +
        "- Before any matching file is touched, the rule is **not** in context. If an instruction must shape *planning* (\"read ADR-12 before designing anything in payments\"), make it unconditional or put it in CLAUDE.md.",
    },
    {
      h: 'Glob rules vs subdirectory CLAUDE.md',
      md: "Both load on demand, but they answer different questions. A subdirectory CLAUDE.md applies to **a place**. A glob rule applies to **a kind of file**, wherever it is. Conventions for test files, migrations, Storybook stories, Dockerfiles, GraphQL schemas or `*.tf` files are usually scattered across dozens of folders in a monorepo. The directory approach would need a copy of the same CLAUDE.md in each folder, kept in sync forever, and every new folder would start without it.",
      table: {
        headers: ['', 'Subdirectory CLAUDE.md', '`.claude/rules/` with `paths:`'],
        rows: [
          ['Scope unit', 'One directory subtree', 'Any set of files matched by globs'],
          ['Cross-cutting file types (tests, migrations)', 'Needs a copy per folder; drifts; new folders miss it', 'One file, e.g. `**/*.test.tsx`'],
          ['Multiple patterns in one rule', 'No', 'Yes, a list plus brace expansion'],
          ['Location of the instructions', 'Scattered next to code', 'Centralised in `.claude/rules/`, easy to review and give CODEOWNERS'],
          ['Good fit', 'A self-contained package or legacy folder with its own context', 'File-type conventions that span the codebase'],
          ['Trigger', 'Claude touches any file in the subtree', 'Claude touches a matching file'],
        ],
      },
      callout: { type: 'good', md: 'Decision rule: "Does this convention follow the **folder** or the **file type**?" Folder → subdirectory CLAUDE.md (or a `dir/**` rule). File type → glob rule.' },
    },
    {
      h: 'Gotchas',
      md: "- **Unquoted `*` breaks YAML.** `paths: **/*.sql` fails to parse. Claude Code then ignores the frontmatter and loads the rule *always*, so it fails open rather than closed. Quote patterns and check with `claude --debug`.\n" +
        "- **Wrong field name.** `globs:`, `applyTo:` or `files:` (from other tools) are silently ignored, so the rule loads unconditionally. Only `paths` counts.\n" +
        "- **Root-relative patterns.** `terraform/**/*` will not match `services/billing/terraform/main.tf`. Use `**/terraform/**` or `**/*.tf` for scattered copies.\n" +
        "- **`*.md` is root-only.** Use `**/*.md` for every directory.\n" +
        "- **Brace explosion.** Each `{a,b}` multiplies patterns. Docs cap a rule at ~1,000 expanded patterns, and anything beyond that matches nothing.\n" +
        "- **Not enforcement.** A path rule is guidance that appears at the right time. Hard guarantees (\"never edit generated files\") still need permissions or hooks.",
    },
  ],
  antiPatterns: [
    'Putting conventions for a file type that is scattered across the codebase (tests, migrations, stories) into one subdirectory CLAUDE.md, or copying it into every folder.',
    'Stuffing every domain\'s conventions into the root CLAUDE.md under headings, so each session pays for and wades through all of them.',
    'Leaving all `.claude/rules/` files unscoped, so the split organises the content but saves no tokens.',
    'Writing globs unquoted or under a field other than `paths`, so the rule silently becomes always-on.',
    'Using a path-scoped rule for instructions Claude needs *before* it opens any matching file (e.g. design constraints for planning).',
  ],
  keyPoints: [
    'A `.claude/rules/*.md` file with YAML `paths:` globs loads only when Claude reads, writes or edits a matching file.',
    'Conditional loading reduces token usage and irrelevant context, and so improves adherence to the rules that do load.',
    'Glob patterns target file types regardless of directory (`**/*.test.tsx`, `**/*.tf`, `**/migrations/*.sql`).',
    'Prefer glob rules over subdirectory CLAUDE.md when a convention spans many directories. Prefer subdirectory CLAUDE.md for folder-specific context.',
    'Quote patterns. Invalid frontmatter makes the rule load unconditionally, and `paths` is the only field read.',
    'A path rule is absent until a matching file is touched, so planning-time rules belong in unconditional files.',
  ],
  pitfalls: [
    'Testing a rule by asking Claude "what are our test conventions?" without opening a test file. It is not loaded yet, so the test looks like a failure.',
    'Patterns anchored at the root (`terraform/**`) when the files actually live under each service.',
    'Overlapping rules with conflicting advice (`**/*.ts` vs `src/api/**/*.ts`). Both load and neither wins.',
    'Forgetting `.tfvars`, `.spec.ts` or `__tests__/` variants in the pattern list.',
    'Assuming the rule disappears after the matching file is closed. It stays in the conversation until compaction.',
  ],
  realWorld: [
    'Monorepos keep `testing.md`, `migrations.md`, `graphql.md` and `docker.md` in `.claude/rules/` with globs, plus a thin root CLAUDE.md.',
    'Infra teams scope Terraform tagging and module-pinning rules to `**/*.tf` so app developers never see them.',
    'Generated-code folders get a rule (`**/generated/**`: "do not edit; change the schema and re-run codegen"), backed by a permission deny rule for real enforcement.',
  ],
  related: ['cca-claude-md', 'cca-commands-skills', 'cca-codebase-context', 'cca-context-preservation', 'cca-plan-mode'],
  quiz: [
    {
      q: "Your platform team wrote eight `.claude/rules/` files (Kafka, Terraform, SQL migrations, GraphQL, React, testing, Docker, security), about 11K tokens in total, all without frontmatter. Front-end developers complain that sessions feel sluggish and Claude sometimes cites Kafka rules during CSS work. What is the best change?",
      options: [
        'Merge all eight files back into the root CLAUDE.md with clear headings',
        'Add `paths:` frontmatter to each domain-specific file so it loads only when matching files are touched, and leave only truly universal rules unscoped',
        'Turn each file into a skill that developers invoke when needed',
        'Delete the rules that front-end developers do not use',
      ],
      answer: 1,
      explain: "Path scoping keeps each rule available exactly where it applies and removes it everywhere else, which reduces both token cost and irrelevant context. Merging into CLAUDE.md keeps the same 11K tokens in every session. Skills rely on someone remembering to invoke them, so conventions would be skipped. Deleting rules breaks the teams that need them.",
    },
    {
      q: "`.claude/rules/migrations.md` starts with `paths: **/migrations/*.sql` (no quotes). Developers notice the migration rules appear in every session, even ones that never touch SQL. What is happening?",
      options: [
        'Path rules always load at launch and only *apply* to matching files',
        'The unquoted leading `*` makes the YAML invalid, so Claude Code ignores the frontmatter and loads the rule unconditionally. Quote the glob',
        '`**` is not supported in rule globs',
        'Rules in `.claude/rules/` cannot be scoped. Only skills accept `paths`',
      ],
      answer: 1,
      explain: "In YAML a value starting with `*` is an alias reference, so parsing fails and the rule falls back to always-on. Quoting fixes it. Properly scoped rules do not load at launch. `**` is supported. `paths` is exactly the field rule files support (skills accept it too).",
    },
    {
      q: "Your design system has Storybook stories (`*.stories.tsx`) colocated next to components in about 70 folders across three apps, and new component folders appear weekly. You want story-writing conventions applied whenever Claude works on a story. Which approach fits best?",
      options: [
        'A CLAUDE.md in each component folder containing the story conventions',
        'A `.claude/rules/stories.md` with `paths: ["**/*.stories.tsx"]`',
        'A section in each app\'s root CLAUDE.md',
        'A personal rule in each developer\'s `~/.claude/rules/`',
      ],
      answer: 1,
      explain: "The convention follows the file type, not a folder. One glob rule covers all 70 existing folders and every future one automatically. Per-folder CLAUDE.md copies drift and new folders miss them. App-level sections load for every task in that app, stories or not. Personal rules are not shared and drift per developer.",
    },
    {
      q: "Which situation most strongly favours a path-scoped rule over a subdirectory CLAUDE.md?",
      options: [
        'Context about a self-contained `legacy-billing/` package that applies to all its files',
        'Rules for SQL migration files that live in each of 14 services\' own `migrations/` folders',
        'Build commands that every task needs',
        'A developer\'s personal preference for verbose explanations',
      ],
      answer: 1,
      explain: "Files of one type scattered across many directories is exactly what globs solve (`**/migrations/*.sql`). A single self-contained folder is well served by its own CLAUDE.md. Universal build commands belong in the root CLAUDE.md. Personal preferences belong at user or local scope.",
    },
    {
      q: "A rule with `paths: [\"src/payments/**\"]` says \"Before proposing any design, read docs/adr/012-ledger.md.\" A developer asks Claude for a design plan for refunds and Claude ignores ADR-12. No payments file had been opened yet. What is the best fix?",
      options: [
        'Write the instruction in bold',
        'Path rules load only after a matching file is touched. Move planning-time instructions to an unconditional location (root CLAUDE.md or a rule without `paths:`), or `@import` the ADR where it is always loaded',
        'Change the glob to `src/payments/*`',
        'Use `/compact` before asking',
      ],
      answer: 1,
      explain: "The rule did not exist in context when the plan was written because no matching file had been read. Anything that must shape reasoning before files are opened needs to be always loaded. Bold text cannot help an instruction that is absent. A narrower glob has the same timing problem. `/compact` does not load rules.",
    },
    {
      q: "You want one rule to cover GraphQL resolvers in `src/**/resolvers/*.ts` and every `.graphql` schema file in the repo. Which frontmatter works?",
      options: [
        '`globs: src/**/resolvers/*.ts, **/*.graphql`',
        '`paths:` followed by list items `\"src/**/resolvers/*.ts\"` and `\"**/*.graphql\"`',
        '`applyTo: \"src/resolvers\"`',
        '`paths: src/resolvers/` (a directory name)',
      ],
      answer: 1,
      explain: "`paths` is the only frontmatter field a rule file honours, and it takes quoted glob patterns as a list (or comma-separated string). `globs` and `applyTo` are names from other tools and would be ignored, which leaves the rule unconditional. A bare directory name is not a glob and points at the wrong level.",
    },
  ],
  references: [
    { title: 'Claude Code docs: Organize rules with .claude/rules/ and path-specific rules', url: 'https://code.claude.com/docs/en/memory#organize-rules-with-claude/rules/' },
    { title: 'Claude Code docs: Monorepos and large codebases', url: 'https://code.claude.com/docs/en/large-codebases' },
    { title: 'Claude Code docs: Context window and what survives compaction', url: 'https://code.claude.com/docs/en/context-window' },
    { title: 'YAML 1.2 spec: aliases and the * indicator', url: 'https://yaml.org/spec/1.2.2/' },
  ],
});
