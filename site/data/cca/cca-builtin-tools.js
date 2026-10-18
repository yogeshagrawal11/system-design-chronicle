SD.concept({
  id: 'cca-builtin-tools',
  category: 'cca',
  domain: 2,
  tasks: ['2.5'],
  order: 5,
  icon: '🛠️',
  title: 'Built-in Tools: Read, Write, Edit, Bash, Grep, Glob',
  tagline: 'Grep searches inside files, Glob finds files by name, Read and Write handle whole files, Edit changes one unique spot. Explore a codebase step by step from entry points; don\'t read everything up front.',
  summary:
    "Claude Code comes with a small set of file and shell tools, and choosing the right one is most of what makes codebase work efficient:\n\n" +
    "- **Grep** searches file **contents** for a pattern: function names, error strings, import statements, call sites.\n" +
    "- **Glob** matches file **paths** by pattern: `**/*.test.tsx`, `src/**/routes/*.ts`.\n" +
    "- **Read** loads a file (with line numbers). **Write** creates or fully overwrites a file.\n" +
    "- **Edit** makes a targeted change by exact string replacement. `old_string` must match **exactly once** (or you set `replace_all`).\n" +
    "- **Bash** runs commands: tests, builds, git, and anything the other tools don't cover.\n\n" +
    "Two habits matter more than any single tool. First, when **Edit fails because the anchor text isn't unique**, add surrounding context, or fall back to **Read the whole file, then Write** the full corrected version. Second, **build understanding incrementally**: Grep for the entry point, Read it, follow its imports with more targeted Reads and Greps. Don't load the whole repository into context. When code is reached through **wrapper modules** that re-export or rename things, first list the names the wrapper exports, then Grep for each of those names across the codebase.",
  analogy:
    "Picture investigating a large library. **Glob** is the catalogue: \"show me every book whose title ends in *Handbook*\". **Grep** is the full-text index: \"which books contain the phrase *quarterly reconciliation*?\". **Read** is taking one book off the shelf. **Edit** is pencilling a correction onto one specific line, which only works if you can point at that line without ambiguity. **Write** is reprinting the whole page when the margins are too crowded to annotate. A good researcher doesn't carry every book to the desk. They check the index, open the right book, then follow its footnotes.",
  diagram: {
    intro: 'Claude Code chooses among built-in tools for each step. The flows show incremental exploration (Grep → Read → Grep), the Edit → Read+Write fallback, and tracing a function through a wrapper module.',
    nodes: [
      { id: 'dev', label: 'Developer', type: 'client', col: 0, row: 1, desc: 'Asks questions like "where do we handle webhook retries?" or "rename this option everywhere".' },
      { id: 'cc', label: 'Claude Code', sub: 'plans each step', type: 'ml', col: 1, row: 1, desc: 'Decides which tool fits the current sub-question: a content search, a path search, a full read, a targeted change, or a command to run.' },
      { id: 'grep', label: 'Grep', sub: 'search contents', type: 'search', col: 2, row: 0, desc: 'Regex search over file contents (ripgrep syntax). Output modes: file paths (default), matching lines with line numbers, or counts. Filter by `glob` or `type`. Skips .gitignored files.' },
      { id: 'glob', label: 'Glob', sub: 'match paths', type: 'search', col: 2, row: 1, desc: 'Finds files by path pattern (`**/*.test.tsx`). Results are sorted by modification time and capped (100), so narrow the pattern if it truncates. Doesn\'t look inside files.' },
      { id: 'read', label: 'Read', sub: 'load a file', type: 'service', col: 2, row: 2, desc: 'Returns file contents with line numbers. Supports offset/limit paging for large files, and also reads images, PDFs (page ranges) and notebooks.' },
      { id: 'edit', label: 'Edit', sub: 'unique replace', type: 'service', col: 3, row: 0, desc: 'Exact string replacement, with no regex or fuzzy matching. Fails if `old_string` is missing or appears more than once (unless `replace_all: true`).' },
      { id: 'write', label: 'Write', sub: 'full overwrite', type: 'service', col: 3, row: 1, desc: 'Creates a file or replaces an existing one with the full content provided. It is the reliable fallback after a Read when no unique Edit anchor exists.' },
      { id: 'bash', label: 'Bash', sub: 'tests · git · build', type: 'worker', col: 3, row: 2, desc: 'Runs shell commands such as test suites, linters, git and package managers. Use it to verify changes, not as a replacement for Read/Edit on files.' },
      { id: 'repo', label: 'Codebase', sub: '1,800 files', type: 'storage', col: 4, row: 1, multi: true, desc: 'A mid-sized TypeScript monorepo. Far too big to read in full: 1,800 files at ~300 lines each is roughly 5M+ tokens.' },
    ],
    edges: [
      { from: 'dev', to: 'cc', both: true },
      { from: 'cc', to: 'grep' },
      { from: 'cc', to: 'glob' },
      { from: 'cc', to: 'read' },
      { from: 'cc', to: 'edit', curve: 0.15 },
      { from: 'cc', to: 'write' },
      { from: 'cc', to: 'bash', curve: -0.15 },
      { from: 'grep', to: 'repo', curve: -0.1 },
      { from: 'glob', to: 'repo', curve: -0.1 },
      { from: 'read', to: 'repo', curve: 0.1 },
      { from: 'edit', to: 'repo' },
      { from: 'write', to: 'repo' },
      { from: 'bash', to: 'repo' },
    ],
    flows: [
      {
        id: 'explore', name: 'Incremental exploration: Grep → Read → follow imports',
        steps: [
          { from: 'dev', to: 'cc', text: '"How do we decide when to retry a failed webhook delivery?"' },
          { from: 'cc', to: 'grep', text: 'Grep for `retry` and `webhook` in `src/**/*.ts`, files-only mode. 7 files match.' },
          { at: 'cc', text: 'From the paths, `src/webhooks/dispatcher.ts` looks like the entry point. It reads only that file and not the other 1,799.' },
          { from: 'cc', to: 'read', text: 'Read dispatcher.ts: it calls `shouldRetry()` imported from `../lib/backoff`.' },
          { from: 'cc', to: 'read', text: 'It follows the import: Read `src/lib/backoff.ts` and finds the retry rules (max 6 attempts, jittered exponential backoff).' },
          { from: 'cc', to: 'grep', text: 'Grep `shouldRetry\\(` with content mode to find the other callers: 2 more sites.' },
          { from: 'cc', to: 'dev', text: 'Answers with file:line references after reading 3 files, about 1,200 lines in context.' },
        ],
      },
      {
        id: 'fallback', name: 'Edit fails on a non-unique anchor → Read + Write',
        steps: [
          { from: 'dev', to: 'cc', text: '"In config/regions.yaml, set timeout_ms to 8000 for the eu-west and eu-central blocks only."' },
          { from: 'cc', to: 'edit', text: 'Edit with old_string `timeout_ms: 5000`. It fails: 9 matches, one per region block.' },
          { at: 'cc', text: 'replace_all would also change the 7 other regions, and the blocks are identical apart from their headers, so there is no small unique anchor.' },
          { from: 'cc', to: 'read', text: 'Read the full file to get the exact current content and structure.' },
          { at: 'cc', text: 'It builds the corrected file, changing only the two EU blocks.' },
          { from: 'cc', to: 'write', text: 'Write the complete new content in one operation.' },
          { from: 'cc', to: 'bash', text: 'Run the config validator / tests to confirm the file still parses and only two values changed (`git diff`).' },
        ],
      },
      {
        id: 'wrapper', name: 'Tracing usage through a wrapper module',
        steps: [
          { from: 'dev', to: 'cc', text: '"Find everything that uses our internal HTTP client before we deprecate it."' },
          { from: 'cc', to: 'grep', text: 'A Grep for `httpClient` finds only 3 uses. That is suspiciously low.' },
          { from: 'cc', to: 'glob', text: 'Glob `src/**/index.ts` under the networking package to find its barrel/wrapper modules.' },
          { from: 'cc', to: 'read', text: 'Read `src/net/index.ts`: it re-exports the client as `api`, `request` and `createFetcher`.' },
          { from: 'cc', to: 'grep', text: 'Grep each exported name, e.g. `import \\{[^}]*\\b(api|request|createFetcher)\\b` and `from [\'"]@/net[\'"]`.' },
          { at: 'cc', text: '64 call sites found through the aliases. The first search missed 95% of usage.' },
          { from: 'cc', to: 'dev', text: 'Returns the full list grouped by alias, with file:line, ready for a migration plan.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Choosing the right tool',
      md: "Most tool-choice mistakes come from mixing up *finding files* and *finding text*, or from rewriting a whole file to change one line.",
      table: {
        headers: ['Question / task', 'Tool', 'Example'],
        rows: [
          ['Where is this function called? Where is this error message raised?', '**Grep** (contents)', 'pattern `chargeCustomer\\(`, glob `**/*.ts`, mode content'],
          ['Which files import X?', '**Grep**', 'pattern `from [\'"]@/billing[\'"]`'],
          ['Find all test files / all migrations / all Dockerfiles', '**Glob** (paths)', '`**/*.test.tsx`, `db/migrations/*.sql`, `**/Dockerfile`'],
          ['Understand one file fully', '**Read**', 'Read `src/auth/session.ts` (page with offset/limit if huge)'],
          ['Change one specific spot', '**Edit**', 'old_string = unique snippet, new_string = replacement'],
          ['Rename a symbol everywhere in one file', '**Edit** with `replace_all: true`', 'old `userId` → new `accountId`'],
          ['Create a new file, or restructure most of a file', '**Write**', 'new `src/flags/defaults.ts`'],
          ['Edit anchor isn\'t unique and context can\'t make it unique', '**Read** then **Write**', 'repetitive YAML/JSON blocks'],
          ['Run tests, build, git, package manager', '**Bash**', '`npm test -- webhooks`, `git diff --stat`'],
        ],
      },
      callout: { type: '', md: '**Guide vs current docs:** the exam guide treats Grep and Glob as standard built-ins. Current Claude Code docs note that on macOS, Linux and WSL the default tool set leaves out the dedicated Glob and Grep tools and searches through Bash (`find` / `grep`, backed by embedded bfs/ugrep). They come back when named in `--tools`/`--allowedTools`, or for a subagent whose `tools` list includes them without Bash. The distinction itself (content search vs path matching) is the same either way, and that is what the exam tests.' },
    },
    {
      h: 'Read, Write and Edit: how they actually behave',
      md: "**Edit** is exact string replacement: no regex, no fuzzy matching. For it to work:\n\n" +
        "- `old_string` must appear **exactly as written**, including whitespace and indentation.\n" +
        "- It must appear **exactly once**. Otherwise you include more surrounding lines to pin down one occurrence, or set `replace_all: true` when every occurrence should change.\n" +
        "- Claude Code expects the file to have been **read in the conversation** first. (Older models always require it. Newer models may skip it when reading wouldn't need a permission prompt.)\n\n" +
        "```\n// FAILS: 'return null;' appears 4 times in the file\nEdit(old_string: \"return null;\", new_string: \"return EMPTY_STATE;\")\n\n// WORKS: enough context to be unique\nEdit(old_string: \"if (!user.isActive) {\\n    return null;\", new_string: \"if (!user.isActive) {\\n    return EMPTY_STATE;\")\n```\n\n" +
        "**Write** replaces the whole file with what you give it. It doesn't append or merge. Use it for new files, wholesale rewrites, and as the **fallback when Edit cannot find a unique anchor**: Read the full current content, produce the corrected full file, and Write it. This is reliable because there is no matching step that can fail. The cost is re-emitting the whole file, so it suits small and medium files.\n\n" +
        "**Read** returns content with line numbers. Large files are read in pages with `offset`/`limit` (by default one call returns up to about 25K tokens). It also handles images, PDFs by page range, and notebooks. It does not list directories.",
      callout: { type: 'good', md: 'Order of preference when Edit says "multiple matches": (1) add surrounding context to make old_string unique; (2) use replace_all if all occurrences really should change; (3) Read + Write the whole file when the occurrences are identical and only some should change.' },
    },
    {
      h: 'Grep and Glob in practice',
      md: "**Grep** (ripgrep-based) supports regex, so escape metacharacters: `interface\\{\\}`, `charge\\(`. Useful options:\n\n" +
        "- Output mode `files_with_matches` (default) for a cheap first pass, `content` for lines with numbers, `count` for how widespread something is.\n" +
        "- `glob: \"**/*.tsx\"` or `type: \"py\"` to limit which files are searched. `multiline: true` for patterns that span lines.\n" +
        "- It respects `.gitignore`, so generated or vendored files won't drown the results.\n\n" +
        "**Glob** matches paths only: `**/*.js` at any depth, `src/**/*.ts`, `*.{json,yaml}`. Results come back ordered by modification time and capped at 100, which is handy for \"recently changed files\" but means a broad pattern can truncate. Narrow it, e.g. `packages/web/**/*.test.tsx` and not `**/*`.\n\n" +
        "A common combination: **Glob** to find candidate files by naming convention, then **Grep** within them for the specific content.",
    },
    {
      h: 'Building understanding incrementally, including through wrappers',
      md: "Reading every file up front fills the context window with irrelevant code, costs a lot, and buries the few lines that matter. Treat exploration as a search:\n\n" +
        "1. **Find entry points with Grep**: route definitions, CLI commands, the error string from the bug report, the public function name.\n" +
        "2. **Read the entry file**, then **follow its imports** one at a time, reading only what the current question needs.\n" +
        "3. **Grep again** for callers or implementations as new names come up.\n" +
        "4. Stop when you can answer, and note file:line evidence as you go.\n\n" +
        "**Wrapper modules** (barrel `index.ts` files, facades, adapters, re-exports with aliases) break naive searches. `export { HttpClient as api } from './client'` means a Grep for `HttpClient` misses every caller that imports `api`. The reliable technique:\n\n" +
        "1. Read the wrapper and **list every exported name**, including aliases and default exports.\n" +
        "2. **Grep each name** across the codebase, and also Grep for imports of the wrapper module path.\n" +
        "3. Repeat if a wrapper re-exports from another wrapper.\n\n" +
        "For very large investigations, run the exploration in a subagent so only the summary comes back to the main context.",
      callout: { type: 'warn', md: 'Reading "all files in src/" to "get familiar" is the anti-pattern. A 1,800-file repo can be millions of tokens. Grep-led exploration usually answers the question after reading a handful of files.' },
    },
  ],
  antiPatterns: [
    'Using Glob to search for text inside files, or Grep when you only need files matching a name pattern.',
    'Reading every file in a directory up front instead of using Grep to find entry points and then following imports.',
    'Retrying Edit with the same short, non-unique old_string after a "multiple matches" failure.',
    'Using replace_all to escape a uniqueness error when only some occurrences should change.',
    'Using Write to change one line in a large file when a unique Edit is possible (wasteful, and risks clobbering content).',
    'Concluding "only 3 usages" from a Grep for the original name when the function is re-exported under aliases by a wrapper module.',
    'Using Bash `sed` or `echo >` for code edits when Edit/Write are available and give reviewable, exact changes.',
  ],
  keyPoints: [
    'Grep = search file contents (callers, error messages, imports). Glob = match file paths (**/*.test.tsx).',
    'Read/Write = whole-file operations. Edit = targeted change, with old_string matching exactly once (or replace_all).',
    'When Edit cannot find unique anchor text: add context, use replace_all if all occurrences should change, otherwise Read the file and Write the corrected whole file.',
    'Explore incrementally: Grep for entry points, Read them, follow imports, Grep for new names. Don\'t read everything up front.',
    'To trace usage through wrapper modules, list all exported names (including aliases), then Grep for each across the codebase.',
    'Bash is for running things (tests, builds, git). Use it to verify edits.',
  ],
  pitfalls: [
    'Unescaped regex metacharacters in Grep patterns (`foo(` errors or matches too much).',
    'Glob results capped at 100 and sorted by modification time. A broad pattern silently truncates.',
    'Grep skips .gitignored files, so search generated code by passing its path explicitly.',
    'Whitespace or tab/space differences make Edit\'s exact match fail. Copy the anchor from a fresh Read.',
    'Write after a stale Read can overwrite someone else\'s concurrent change. Re-read before a full overwrite.',
  ],
  realWorld: [
    'Claude Code permission rules, hooks and subagent `tools:` lists refer to these exact tool names (Read, Edit, Write, Bash, Grep, Glob).',
    'Read-only reviewer subagents are commonly limited to `Read, Grep, Glob`.',
    'Large migrations (API renames, deprecations) start with alias-aware Grep sweeps through barrel files before any Edit.',
  ],
  related: ['cca-tool-descriptions', 'cca-tool-distribution', 'cca-mcp-integration', 'cca-mcp-errors', 'ai-agents-tool-use'],
  quiz: [
    {
      q: 'A production log shows the error text "ledger snapshot drift exceeded". You need to find where in a 2,000-file repo this message is raised. Which approach is most efficient?',
      options: [
        'Grep the codebase for `ledger snapshot drift exceeded` (content mode), then Read the matching file around the reported line.',
        'Glob `**/*ledger*` and Read every match.',
        'Read all files under `src/` and scan them.',
        'Run the test suite with Bash and wait for the error to appear.',
      ],
      answer: 0,
      explain: 'Searching for a known string inside files is what Grep is for, and Reading only the match follows the incremental pattern. Glob matches filenames, and the message may live in a file without "ledger" in its name. Reading everything wastes huge amounts of context. Running tests does not reliably locate the source line.',
    },
    {
      q: 'Before upgrading a testing library, you want a list of every Playwright spec file. They follow the convention `*.spec.ts` under any `e2e/` directory. Which tool call fits?',
      options: [
        'Grep for `test(` across the repo.',
        'Edit each spec file to add a marker comment, then Grep for it.',
        'Read the root package.json.',
        'Glob with pattern `**/e2e/**/*.spec.ts`.',
      ],
      answer: 3,
      explain: 'Finding files by a naming/path pattern is Glob\'s job. Grepping for `test(` matches unit tests and other files and returns content you did not need. package.json does not list spec files. Editing files to locate them is destructive and roundabout.',
    },
    {
      q: 'Claude tries `Edit(old_string: "enabled: false", new_string: "enabled: true")` on a feature-flag YAML file and gets "found 12 matches". Only the flags under the `checkout:` and `search:` sections should change, and the entries are otherwise identical. What should it do?',
      options: [
        'Retry the same Edit. It may succeed the second time.',
        'Use `replace_all: true`.',
        'Read the full file, build the corrected content with only those two sections changed, and Write the whole file (then verify with a diff or validator).',
        'Delete the file and ask the developer to recreate it.',
      ],
      answer: 2,
      explain: 'When the anchor is not unique and surrounding context cannot easily single out the targets, Read + Write is the reliable fallback. (Including the section header in old_string can also work if it makes the match unique.) Retrying the same Edit fails the same way. replace_all would wrongly flip all 12 flags. Deleting the file is destructive and unnecessary.',
    },
    {
      q: 'A developer asks Claude to explain how authentication works in an unfamiliar 900-file service. Which strategy best balances accuracy and context usage?',
      options: [
        'Read all 900 files first so nothing is missed.',
        'Grep for entry points (e.g. auth middleware registration, `login` routes), Read those files, follow their imports with targeted Reads, and Grep for new symbols as they appear.',
        'Glob `**/*` and summarize the file names.',
        'Ask the developer to paste the relevant files.',
      ],
      answer: 1,
      explain: 'Incremental exploration starting from Grep-found entry points keeps context focused and traces the real flow. Reading everything overwhelms the context window and costs a lot. File names alone cannot explain behaviour. Pushing the search back to the developer defeats the purpose.',
    },
    {
      q: 'You need every caller of `formatCurrency` before changing its signature. A Grep finds only 2 callers, yet the function is clearly used across the UI. You notice `src/utils/index.ts` contains `export { formatCurrency as fmtMoney, formatCurrency as money } from "./currency"`. What is the right next step?',
      options: [
        'Conclude there are 2 callers and proceed.',
        'Rename the function and let the TypeScript build show what breaks, then work backwards.',
        'Read the wrapper to list all exported names and aliases, then Grep for each (`fmtMoney`, `money`, plus imports from the utils module) across the codebase.',
        'Glob for files named `*currency*`.',
      ],
      answer: 2,
      explain: 'Wrapper modules re-export names under aliases, so you must enumerate the exported names and search for each. Trusting the first Grep misses most usage. Breaking the build to discover callers is slow and fails for dynamically typed or untyped callers. Glob on file names does not find call sites.',
    },
    {
      q: 'In one 600-line file, a local variable `tmpResult` should be renamed to `normalizedRows` at all 14 occurrences. What is the most appropriate tool usage?',
      options: [
        'One Edit with `old_string: "tmpResult"`, `new_string: "normalizedRows"` and `replace_all: true`, after confirming every occurrence should change (e.g. it doesn\'t appear in strings or other identifiers that must stay).',
        '14 separate Edit calls, each with a unique context snippet.',
        'Read the file and Write it back with the changes.',
        'Use Bash with `sed -i` across the whole repo.',
      ],
      answer: 0,
      explain: 'When every occurrence in a file should change, replace_all is the intended Edit option: exact, single step, reviewable. Fourteen unique-context edits are slow and error-prone. Read+Write works but re-emits 600 lines unnecessarily. A repo-wide sed goes beyond the requested file and could change unrelated code.',
    },
  ],
  references: [
    { title: 'Claude Code Docs — Tools reference (Read, Edit, Write, Grep, Glob, Bash behaviour)', url: 'https://code.claude.com/docs/en/tools-reference' },
    { title: 'Claude Code Docs — Common workflows (understanding new codebases)', url: 'https://code.claude.com/docs/en/common-workflows' },
    { title: 'Claude Code Docs — Subagents (restricting tools)', url: 'https://code.claude.com/docs/en/sub-agents' },
    { title: 'ripgrep — regex syntax used by Grep', url: 'https://github.com/BurntSushi/ripgrep' },
  ],
});
