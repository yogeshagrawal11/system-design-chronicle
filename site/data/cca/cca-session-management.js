SD.concept({
  id: 'cca-session-management',
  category: 'cca',
  domain: 1,
  tasks: ['1.7'],
  order: 7,
  icon: '💾',
  title: 'Session State: Resume, Fork & Fresh Starts',
  tagline: 'Resume a named session when its context is still true, fork it to explore alternatives, and start fresh with a structured summary when its tool results have gone stale.',
  summary:
    "A **session** is the persisted conversation — prompts, tool calls, tool results and responses — that Claude Code and the Agent SDK write to disk as the agent works. Returning to a session restores everything the agent had learned: files it read, analysis it did, decisions it made. Three operations matter:\n\n" +
    "- **Resume** a specific session to continue it. In Claude Code, name sessions (`claude -n payments-audit`, or `/rename` mid-session) and come back with **`claude --resume payments-audit`**. In the SDK, pass the captured `session_id` as `resume`. (`--continue` / `continue_conversation` just picks the most recent session in the directory.)\n" +
    "- **Fork** a session to branch: **`fork_session=True`** (Python), `forkSession: true` (TypeScript) or `--fork-session` on the CLI creates a new session id that starts with a copy of the history, leaving the original untouched. Use it to compare two approaches from one shared analysis.\n" +
    "- **Start fresh with a summary** when the old session's tool results no longer describe reality. A resumed transcript still \"remembers\" yesterday's file contents; if the code changed, that memory is wrong but confident.\n\n" +
    "The judgement the exam tests is choosing among these — and, when you do resume after changes, **telling the agent exactly which files changed** so it re-reads those instead of either trusting stale results or re-exploring everything.",
  analogy:
    "Picking up a jigsaw puzzle. If nobody touched the table overnight, sit back down and carry on (resume). If you want to try two ways of finishing the sky, photograph the table and work on two copies (fork). If someone moved a few pieces, say \"the top-left corner was moved\" and recheck only that corner (resume + change notice). If the cat knocked half of it on the floor, do not trust your memory of the layout — start a fresh table using your notes about which strategy was working (fresh session + summary).",
  diagram: {
    intro: 'Sessions live as transcripts on disk (or in a SessionStore). Resume continues one; fork copies its history into a new id; a fresh session starts clean but receives a structured summary of what is still true.',
    nodes: [
      { id: 'dev', label: 'Developer', sub: 'multi-day work', type: 'client', col: 0, row: 1, desc: 'Works on an investigation over several days and sometimes wants to compare alternatives.' },
      { id: 'cli', label: 'Claude Code / SDK', sub: '--resume · fork_session', type: 'service', col: 1, row: 1, desc: 'Starts, names, resumes and forks sessions. CLI: `-n/--name`, `--resume <name|id>`, `--continue`, `--fork-session`. SDK: `resume`, `fork_session`/`forkSession`, `continue_conversation`/`continue`.', tech: ['Claude Code CLI', 'Claude Agent SDK'] },
      { id: 'store', label: 'Session Transcripts', sub: '~/.claude/projects/*.jsonl', type: 'db', col: 2, row: 1, desc: 'Persisted conversation history per session. Local to the machine by default; a SessionStore adapter can mirror transcripts to shared storage for other hosts.' },
      { id: 'named', label: 'payments-audit', sub: 'named session', type: 'worker', col: 3, row: 0, desc: 'A long-running investigation resumed by name across work sessions. Holds the prior analysis and tool results.' },
      { id: 'forkA', label: 'Fork: idempotency keys', sub: 'new session id', type: 'worker', col: 4.5, row: 0, desc: 'Branch exploring one fix strategy from the shared baseline.' },
      { id: 'forkB', label: 'Fork: outbox pattern', sub: 'new session id', type: 'worker', col: 4.5, row: 1, desc: 'Branch exploring the alternative from the same baseline; independent of fork A.' },
      { id: 'fresh', label: 'Fresh Session', sub: 'summary injected', type: 'worker', col: 3, row: 2, desc: 'A clean session that starts with a structured summary of durable conclusions and re-reads current code, instead of inheriting stale tool results.' },
      { id: 'summary', label: 'Structured Summary', sub: 'decisions · open items', type: 'storage', col: 2, row: 3, desc: 'A short document produced from the old session: goal, conclusions that are still valid, decisions and why, open questions, and which files must be re-read.' },
      { id: 'repo', label: 'Git Repo', sub: 'changes since last run', type: 'storage', col: 4.5, row: 2.5, desc: 'The real source of truth. `git diff --stat` since the last session tells you which prior tool results are stale.' },
    ],
    edges: [
      { from: 'dev', to: 'cli', both: true, label: 'commands' },
      { from: 'cli', to: 'store', both: true, label: 'load / save' },
      { from: 'store', to: 'named', label: 'resume' },
      { from: 'named', to: 'forkA', label: 'fork' },
      { from: 'named', to: 'forkB', label: 'fork', curve: 0.2 },
      { from: 'store', to: 'summary', label: 'summarise', curve: -0.2 },
      { from: 'summary', to: 'fresh', label: 'inject' },
      { from: 'fresh', to: 'repo', label: 're-read' },
      { from: 'named', to: 'repo', label: 'targeted re-read', curve: 0.35 },
    ],
    flows: [
      {
        id: 'resume', name: 'Resume a named session and flag what changed',
        steps: [
          { from: 'dev', to: 'cli', text: 'Monday: `claude -n payments-audit` — Claude maps the payment retry paths (40 min of reading).' },
          { from: 'cli', to: 'store', text: 'The transcript is saved under the session\'s id and display name.' },
          { from: 'dev', to: 'cli', text: 'Tuesday: `claude --resume payments-audit` — not `--continue`, which might pick another recent session.' },
          { from: 'store', to: 'named', text: 'The full prior analysis is restored; nothing needs re-exploring.' },
          { at: 'repo', text: 'Since Monday, a teammate changed `retry.py` and deleted `legacy_client.py` (`git diff --stat`).' },
          { from: 'dev', to: 'named', text: 'First message: \"Since last time: retry.py now uses jittered backoff; legacy_client.py was removed. Re-read those; the rest is unchanged.\"' },
          { from: 'named', to: 'repo', text: 'Claude re-reads only the two affected files and updates its conclusions.' },
        ],
      },
      {
        id: 'fork', name: 'Fork the baseline to compare two strategies',
        steps: [
          { from: 'dev', to: 'cli', text: 'The baseline session has diagnosed duplicate charges caused by retries.' },
          { from: 'cli', to: 'named', text: '`claude --resume payments-audit --fork-session` → \"Design a fix using idempotency keys.\"' },
          { from: 'named', to: 'forkA', text: 'Fork A gets a new session id and a copy of the full diagnosis.' },
          { from: 'named', to: 'forkB', text: 'A second fork from the same baseline: \"Design a fix using a transactional outbox.\"' },
          { at: 'named', text: 'The baseline is unchanged and still resumable; neither fork sees the other\'s reasoning.' },
          { from: 'forkA', to: 'dev', text: 'The developer compares two independent proposals built on identical analysis.' },
        ],
      },
      {
        id: 'fresh', name: 'Stale context: start fresh with a structured summary',
        steps: [
          { from: 'dev', to: 'cli', text: 'Three weeks later, after a large refactor touched ~60% of the module, the developer returns.' },
          { at: 'store', text: 'The old transcript is full of file contents and line numbers that no longer exist.' },
          { from: 'store', to: 'summary', text: 'Extract what is still true: goal, root cause, decisions and rationale, open questions.' },
          { from: 'summary', to: 'fresh', text: 'A new session starts with that summary plus \"verify against current code before relying on any detail\".' },
          { from: 'fresh', to: 'repo', text: 'Claude reads the current code with no stale results competing for attention.' },
          { from: 'fresh', to: 'dev', text: 'Advice now matches the code as it is, not as it was.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Resume, continue and fork — the commands',
      md: "```bash\n# Claude Code CLI\nclaude -n payments-audit                   # start a session with a display name\n/rename payments-audit                     # (inside a session) name or rename it\nclaude --resume payments-audit             # resume by name (or by id)\nclaude -r payments-audit \"pick up at the retry analysis\"\nclaude --continue                          # most recent session in this directory\nclaude --resume payments-audit --fork-session   # branch into a new session id\nclaude -p --resume <id> \"summarise open issues\" # non-interactive\n```\n\n" +
        "```python\n# Claude Agent SDK (Python); TypeScript uses resume / forkSession / continue\nopts = ClaudeAgentOptions(resume=session_id)                     # continue a specific session\nopts = ClaudeAgentOptions(resume=session_id, fork_session=True)  # branch it\nopts = ClaudeAgentOptions(continue_conversation=True)            # most recent in cwd\n# capture ids from ResultMessage.session_id; rename_session()/tag_session() organise them\n```",
      table: {
        headers: ['Operation', 'Finds the session by', 'Writes to', 'Use when'],
        rows: [
          ['`--continue` / `continue_conversation`', 'Most recent in the current directory', 'That same session', 'One conversation at a time, quick pick-up'],
          ['`--resume <name|id>` / `resume=id`', 'Explicit name or id', 'That same session', 'Multiple parallel investigations; per-user sessions in an app'],
          ['`--fork-session` / `fork_session=True`', 'Explicit id/name (with resume or continue)', 'A NEW session id with copied history', 'Exploring alternatives without polluting the baseline'],
          ['Fresh session + summary', 'Nothing — new session', 'A new session', 'Prior tool results are stale or the transcript is bloated'],
        ],
      },
      callout: { type: 'warn', md: 'Sessions persist the **conversation, not the filesystem**. Forks share the working directory: two forks editing the same files will collide. Use separate git worktrees (or file checkpointing) when branches make real changes.' },
    },
    {
      h: 'Telling a resumed session what changed',
      md: "A resumed session believes its old tool results. If `retry.py` changed since the agent read it, the agent may reason confidently about code that no longer exists. Two bad extremes: say nothing (stale reasoning) or ask it to re-explore everything (wastes the point of resuming). The right move is a **targeted change notice**:\n\n" +
        "```text\nSince our last session (Mon 17:40):\n- MODIFIED src/payments/retry.py   (exponential backoff -> jittered; max 5 attempts)\n- DELETED  src/payments/legacy_client.py\n- ADDED    src/payments/idempotency.py\nAll other files you analysed are unchanged (git diff --stat attached).\nRe-read the three files above, update any conclusions that depended on them,\nthen continue with the duplicate-charge analysis.\n```\n\n" +
        "This keeps the 90% of prior context that is still valid, and re-grounds exactly the 10% that is not. `git diff --stat <last-commit>..HEAD` is a cheap way to generate the list.",
    },
    {
      h: 'When to start fresh with a structured summary',
      md: "Resuming is not always better. A transcript full of outdated file contents, superseded hypotheses and long tool outputs can mislead more than it helps — and it also consumes context. Starting a new session with a **structured summary** gives the agent the durable knowledge without the stale evidence.",
      table: {
        headers: ['Situation', 'Resume (± change notice)', 'Fresh session + summary'],
        rows: [
          ['Same day, no code changes', '✅ Best — full context intact', 'Unnecessary'],
          ['A few known files changed', '✅ Resume and list the changed files', 'Possible but loses useful detail'],
          ['Large refactor; most analysed files changed', '⚠️ Stale results dominate', '✅ Best'],
          ['Transcript near context limits after many tool outputs', '⚠️ Compaction may drop key details', '✅ Best'],
          ['Handing work to a teammate or another machine', 'Requires the transcript to be available there (or a SessionStore)', '✅ Summary is portable'],
        ],
      },
      callout: { type: 'good', md: "A good summary is structured, not narrative: **goal**; **conclusions still valid** (with evidence such as commit or file names); **decisions and why**; **rejected options and why**; **open questions**; **files to re-read first**. Tell the new session to verify details against current code." },
    },
    {
      h: 'Sessions in production SDK apps',
      md: "- **Per-user sessions**: in a multi-user service, store each user's `session_id` and pass it to `resume`. Never use `continue` (most recent in the directory) — it can attach one user's request to another user's conversation.\n" +
        "- **Across hosts**: session files are local by default. For serverless or ephemeral containers, use a SessionStore adapter, move the transcript file, or — often most robust — keep the important results as application state and inject them into a fresh session.\n" +
        "- **Recovering from limits**: a run that ended with `error_max_turns` or `error_max_budget_usd` can be resumed with a higher limit; the `ResultMessage` still carries the `session_id`.\n" +
        "- **Subagents**: a subagent can be resumed (same parent session, its agent id in the prompt) when follow-up work needs its prior context.\n" +
        "- **Hygiene**: name or tag sessions by task (`payments-audit`, `flaky-test-1432`) so the right one is easy to find weeks later.",
    },
  ],
  antiPatterns: [
    'Starting a brand-new session every morning and re-exploring the same codebase for 20 minutes instead of resuming a named session.',
    'Using `--continue` when several investigations run in the same directory, and picking up the wrong one.',
    'Resuming after significant code changes without telling the agent which files changed.',
    'Forcing a full re-exploration on resume when only a few known files changed.',
    'Resuming a weeks-old session whose tool results describe code that has since been heavily refactored, instead of starting fresh with a summary.',
    'Exploring two alternative approaches sequentially in one session, so the first biases the second, instead of forking.',
    'Assuming a fork isolates file changes; it isolates only the conversation.',
    'Using "most recent session" logic in a multi-user SDK service.',
  ],
  keyPoints: [
    'Name sessions (`-n`, `/rename`) and resume them with `--resume <name>`; the SDK resumes by `session_id`.',
    '`--continue` picks the most recent session in the directory; `--resume` targets a specific one.',
    '`fork_session` / `--fork-session` creates a new session id with a copy of the history; the original is unchanged.',
    'Forks branch the conversation, not the filesystem.',
    'On resume after code changes, tell the agent exactly which files changed so it re-reads only those.',
    'Resume when prior context is mostly valid; start fresh with a structured summary when tool results are stale.',
    'In multi-user apps, store and resume per-user session ids.',
  ],
  pitfalls: [
    'Session transcripts are machine-local by default; resuming in CI or serverless needs a SessionStore or another strategy.',
    'System prompt flags passed on a resumed run do not take effect until compaction or a new conversation, because the recorded system prompt is reused.',
    'Summaries written as prose narratives lose the decisions and open questions; use a fixed structure.',
    'Very long resumed sessions may compact automatically and drop early details; keep durable rules in CLAUDE.md.',
  ],
  realWorld: [
    'Claude Code stores transcripts under `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, which is what `--resume` reads.',
    'The Agent SDK exposes `list_sessions()` / `listSessions()` and `get_session_messages()` to build custom session pickers and viewers.',
    'Teams commonly keep a `HANDOFF.md` or task-notes file as the portable summary between sessions and between people.',
  ],
  related: ['cca-subagent-context', 'cca-coordinator-subagents', 'cca-task-decomposition', 'cca-agentic-loop', 'stateful-vs-stateless', 'disaster-recovery'],
  quiz: [
    {
      q: 'A developer is chasing an intermittent deadlock over several days. Every morning they open a new Claude Code session and spend about 20 minutes having it re-read the same modules. They usually have two or three other sessions open in the same repo. What should they do?',
      options: [
        'Use `claude --continue` each morning',
        'Paste yesterday\'s final answer into a new session each morning',
        'Name the investigation session (for example `claude -n deadlock-hunt` or `/rename`) and return to it with `claude --resume deadlock-hunt`',
        'Write the module contents into CLAUDE.md so every session loads them',
      ],
      answer: 2,
      explain: 'A named resume restores the full analysis of that specific investigation. `--continue` (A) picks the most recent session in the directory, which may be one of the other sessions. Pasting the final answer (B) loses the intermediate findings. Putting code in CLAUDE.md (D) bloats every session and goes stale.',
    },
    {
      q: 'You resume a named session that analysed 25 files yesterday. Overnight a teammate merged changes to 3 of those files. The resumed agent starts recommending edits to a function that was renamed. What is the best next step?',
      options: [
        'Tell the session exactly which 3 files changed (for example from `git diff --stat`) and what changed, and ask it to re-read those before continuing',
        'Ask it to re-explore the whole repository from scratch',
        'Abandon the session and start over with no context',
        'Ignore it; the agent will notice the rename when its edit fails',
      ],
      answer: 0,
      explain: 'A targeted change notice re-grounds the stale part and keeps the rest of the valid context. A full re-exploration (B) or starting over (C) throws away good analysis. Waiting for failures (D) wastes turns and risks bad edits landing first.',
    },
    {
      q: 'Three weeks ago a session produced a detailed analysis of the notifications module. Since then the module has been rewritten, with about 60% of its files changed. You need to continue the work. What approach is most reliable?',
      options: [
        'Resume the old session and ask it to be careful about outdated information',
        'Fork the old session and continue in the fork',
        'Resume the old session and list all 60% of the files as changed',
        'Start a new session and give it a structured summary of the durable conclusions (goals, decisions and rationale, open questions), with instructions to verify everything against the current code',
      ],
      answer: 3,
      explain: 'When most tool results are stale, a fresh session with a summary carries the knowledge without the outdated evidence. Resuming with a caution (A) leaves stale file contents competing for attention. A fork (B) copies the same stale history. Listing most files as changed (C) means re-reading nearly everything while the stale history still sits in context.',
    },
    {
      q: 'Your SDK app has finished a long codebase analysis in session `S`. You want two independent design explorations from that analysis, one for Redis caching and one for a read replica, while keeping `S` reusable. Which option configuration is correct for each exploration?',
      options: [
        '`continue_conversation=True` for both explorations',
        '`resume=S, fork_session=True` for each exploration, which gives each its own new session id',
        '`resume=S` for both explorations, run one after the other',
        'A new session with no resume, prompted "use the earlier analysis"',
      ],
      answer: 1,
      explain: 'Forking copies S\'s history into a new session each time and leaves S unchanged. Continue (A) and plain resume (C) both append to the same history, so the explorations contaminate each other and alter S. A new session (D) has none of the analysis.',
    },
    {
      q: 'A multi-tenant support product built on the Agent SDK uses `continue: true` to keep conversations going. QA finds that a user sometimes receives answers that refer to another user\'s order. What is the fix?',
      options: [
        'Store each user\'s session_id and pass it as `resume` on that user\'s subsequent queries',
        'Add a system-prompt rule telling the agent to ignore other users\' data',
        'Clear all sessions every hour',
        'Use `fork_session` on every request',
      ],
      answer: 0,
      explain: '`continue` resumes the most recent session in the working directory, which can belong to a different user. Explicit per-user session ids are the correct isolation. A prompt rule (B) cannot fix wrong context that has already been loaded. Hourly clearing (C) still mixes users between clears. Forking every request (D) still branches from whichever session it picked.',
    },
    {
      q: 'An engineer forks one session into two branches to try two refactorings. Both forks edit files in the same checkout, and the second fork\'s edits overwrite the first\'s. What explains this, and what should they do?',
      options: [
        'Forking is broken; use `--continue` instead',
        'The forks should have used different models',
        'Forks branch the conversation history, not the filesystem; run each branch in its own git worktree (or use checkpoints) so file changes stay isolated',
        'Fork only with the SDK, not the CLI, because the SDK isolates files',
      ],
      answer: 2,
      explain: 'Session forking copies the transcript only, so file edits are real and shared through the working directory. Separate worktrees isolate them. `--continue` (A) does not branch at all. The model choice (B) is irrelevant. The SDK behaves the same way as the CLI here (D).',
    },
  ],
  references: [
    { title: 'Claude Agent SDK — Work with sessions (resume, fork_session, continue)', url: 'https://code.claude.com/docs/en/agent-sdk/sessions' },
    { title: 'Claude Code — CLI reference (--resume, --continue, --fork-session, --name)', url: 'https://code.claude.com/docs/en/cli-reference' },
    { title: 'Claude Code — Sessions', url: 'https://code.claude.com/docs/en/sessions' },
    { title: 'Claude Agent SDK — Session storage (resume across hosts)', url: 'https://code.claude.com/docs/en/agent-sdk/session-storage' },
  ],
});
