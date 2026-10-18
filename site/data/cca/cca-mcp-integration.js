SD.concept({
  id: 'cca-mcp-integration',
  category: 'cca',
  domain: 2,
  tasks: ['2.4'],
  order: 4,
  icon: '🔌',
  title: 'Integrating MCP Servers into Claude Code & Agents',
  tagline: 'Shared servers go in a committed .mcp.json with ${ENV} placeholders for secrets, personal ones in ~/.claude.json. Use community servers for standard systems, and expose catalogs as resources so the agent doesn\'t have to go exploring.',
  summary:
    "The **Model Context Protocol (MCP)** lets Claude Code, or any agent built on the Agent SDK, connect to external systems through *servers* that expose **tools** (actions the model calls), **resources** (readable content addressed by URI) and **prompts** (reusable templates). Integrating a server well comes down to a few decisions:\n\n" +
    "- **Where it is configured.** Team tooling goes in the project-scoped **`.mcp.json`** at the repo root, committed to version control so every clone gets it. Personal or experimental servers go in **`~/.claude.json`** (user scope for all your projects, or the default *local* scope for just you in one project).\n" +
    "- **How secrets are handled.** `.mcp.json` supports **environment variable expansion**: `${GITHUB_TOKEN}` or `${API_URL:-https://default}`. The file can be shared while each developer's token stays in their own environment.\n" +
    "- **What the agent sees.** Tools from **every connected server are discovered when the session connects** and are all available at once. That makes tool descriptions important. A vague MCP description loses to built-in tools like Grep even when the MCP tool is far more capable.\n" +
    "- **Build or reuse.** Use mature **community servers** for standard systems (Jira, GitHub, Slack, Postgres) and write **custom servers** only for team-specific workflows.\n" +
    "- **Resources for catalogs.** Exposing an issue list, a documentation tree or a database schema as MCP **resources** shows the agent what exists up front, so it doesn't spend calls exploring.",
  analogy:
    "Think of a new hire's first day. The **team handbook in the shared drive** (`.mcp.json`) lists the systems everyone uses: \"ticket tracker, code host, deploy console\". It never contains anyone's password. Each person logs in with their own badge (`${TOKEN}` from their environment). The **notes on your own desk** (`~/.claude.json`) list the beta tools only you are trying out. Nobody builds their own email client when the company's works fine (community servers). And a **building directory at the entrance** (resources) saves you opening every door to find the room you need.",
  diagram: {
    intro: 'Claude Code reads MCP config from three scopes, connects to every configured server, and gives the model all their tools at once (plus resources it can browse). Secrets come from the developer\'s environment, never from the committed file.',
    nodes: [
      { id: 'env', label: 'Shell Env / Vault', sub: 'GITHUB_TOKEN, JIRA_TOKEN', type: 'auth', col: 0, row: 0, desc: 'Each developer\'s own credentials, exported by their shell, a secrets manager or CI secrets. Claude Code substitutes them into `${VAR}` placeholders when it loads `.mcp.json`.' },
      { id: 'dev', label: 'Developer', type: 'client', col: 0, row: 1, desc: 'Clones the repo and runs `claude`. On first use, Claude Code asks them to approve the project-scoped servers from `.mcp.json`.' },
      { id: 'proj', label: '.mcp.json', sub: 'project scope · in git', type: 'storage', col: 1, row: 0, desc: 'Committed at the repo root. Defines shared team servers (GitHub, Jira, team deploy server) with `${VAR}` placeholders for tokens. Everyone who clones gets the same tooling.' },
      { id: 'cc', label: 'Claude Code', sub: 'MCP client', type: 'ml', col: 1, row: 1, desc: 'Merges servers from all scopes (local > project > user when names collide, whole entry wins, no field merging), connects to each, runs `tools/list` and `resources/list`, and exposes every tool to the model as `mcp__<server>__<tool>`.' },
      { id: 'userc', label: '~/.claude.json', sub: 'user + local scope', type: 'storage', col: 1, row: 2, desc: 'Personal config, never committed. User scope: available in all your projects. Local scope (the default for `claude mcp add`): only you, only this project. Good for experiments and personal tools.' },
      { id: 'github', label: 'GitHub MCP', sub: 'community server', type: 'external', col: 3, row: 0, desc: 'Off-the-shelf server for PRs, issues and code search. Standard integration, so use the maintained community server and don\'t write your own.' },
      { id: 'jira', label: 'Jira MCP', sub: 'community server', type: 'external', col: 3, row: 1, desc: 'Community server for issue search and updates. Also exposes resources such as an issue-summary catalog for the current sprint.' },
      { id: 'deploy', label: 'Team Deploy MCP', sub: 'custom server', type: 'service', col: 3, row: 2, desc: 'Custom server for a workflow only this team has: promote a build through their release gates, read their runbooks. Worth building because nothing generic exists.' },
      { id: 'exp', label: 'Experimental MCP', sub: 'personal · user scope', type: 'worker', col: 2, row: 3, desc: 'A server one developer is evaluating. It lives in their ~/.claude.json, so it never shows up for, or breaks, teammates.' },
      { id: 'res', label: 'Resource Catalog', sub: 'runbooks · schemas', type: 'db', col: 4, row: 2, desc: 'Content exposed as MCP resources (e.g. `runbook://payments/rollback`, `schema://orders`). Listed by URI with names and descriptions, so the agent can see what exists before it reads anything.' },
      { id: 'grep', label: 'Built-in Search', sub: 'Grep / Bash', type: 'search', col: 2, row: 2, desc: 'Claude Code\'s built-in text search. If an MCP tool\'s description is vague, the model falls back to this familiar tool even when the MCP tool would give far better answers.' },
    ],
    edges: [
      { from: 'dev', to: 'cc', both: true },
      { from: 'proj', to: 'cc', label: 'load' },
      { from: 'userc', to: 'cc', label: 'load' },
      { from: 'env', to: 'proj', label: '${VAR}' },
      { from: 'cc', to: 'github' },
      { from: 'cc', to: 'jira' },
      { from: 'cc', to: 'deploy' },
      { from: 'cc', to: 'exp' },
      { from: 'cc', to: 'grep' },
      { from: 'deploy', to: 'res' },
    ],
    flows: [
      {
        id: 'onboard', name: 'Teammate onboarding with a shared .mcp.json',
        steps: [
          { from: 'dev', to: 'cc', text: 'A new teammate clones the repo and runs `claude`.' },
          { from: 'proj', to: 'cc', text: 'Claude Code finds `.mcp.json` with github, jira and deploy servers. The tokens appear only as `${GITHUB_TOKEN}` and `${JIRA_TOKEN}`.' },
          { from: 'env', to: 'proj', text: 'Placeholders are filled from the teammate\'s own environment. If a variable is unset, the config still loads with a warning (`/mcp`, `claude mcp list`).' },
          { at: 'cc', text: 'Because these are project-scoped servers from a repo, Claude Code asks the teammate to approve them before use.' },
          { from: 'cc', to: 'github', text: 'It connects to each server and runs tools/list. All tools from all servers are now available together.' },
          { from: 'cc', to: 'deploy', text: 'The custom deploy server is discovered the same way. Its tools appear as `mcp__deploy__...`.' },
          { from: 'cc', to: 'dev', text: 'Day one: the teammate has the same tooling as everyone else, and no secret was ever committed.' },
        ],
      },
      {
        id: 'resources', name: 'Resources replace exploratory tool calls',
        steps: [
          { from: 'dev', to: 'cc', text: '"Payments are failing in staging. Follow the right runbook."' },
          { at: 'cc', text: 'Without resources, the agent would call search_docs repeatedly ("payments", "rollback", "staging") to find out which runbooks exist.' },
          { from: 'cc', to: 'deploy', text: 'With resources, the session already has the catalog from resources/list: names and descriptions of 40 runbooks.' },
          { from: 'deploy', to: 'res', text: 'The agent reads one URI directly: `runbook://payments/staging-rollback`.' },
          { from: 'cc', to: 'deploy', text: 'It then calls the tool the runbook names: `promote_build(env="staging", build="prev")`.' },
          { from: 'cc', to: 'dev', text: 'Done in 2 calls rather than 8. The developer could also attach it explicitly with `@deploy:runbook://payments/staging-rollback`.' },
        ],
      },
      {
        id: 'prefer', name: 'Agent prefers Grep until the MCP description improves',
        steps: [
          { from: 'dev', to: 'cc', text: '"Find every service that calls the legacy billing endpoint."' },
          { at: 'cc', text: 'The MCP tool `code_index_query` is described only as "Queries the code index."' },
          { from: 'cc', to: 'grep', text: 'The model picks familiar built-in Grep, finds string matches in this repo only, and misses 9 other repos.' },
          { at: 'deploy', text: 'The server owner rewrites the description: "Cross-repo semantic search over all 140 company repos, resolves call graphs and aliases, returns repo/file/line plus caller symbol. Prefer over Grep when the question spans repositories or needs callers."' },
          { from: 'dev', to: 'cc', text: 'The same question is asked again.' },
          { from: 'cc', to: 'deploy', text: 'The model now chooses the MCP tool and gets complete cross-repo results.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Scopes: project, user and local',
      md: "Claude Code stores MCP server definitions at three scopes. Pick one with `claude mcp add --scope <local|project|user>`:",
      table: {
        headers: ['Scope', 'Stored in', 'Applies to', 'Shared via git?', 'Use for'],
        rows: [
          ['**project**', '`.mcp.json` at the repo root', 'Everyone working in this repo', 'Yes', 'Team tooling: issue tracker, code host, team-specific servers'],
          ['**user**', '`~/.claude.json`', 'You, in all your projects', 'No', 'Personal utilities you want everywhere'],
          ['**local** (default)', '`~/.claude.json`, under this project\'s path', 'You, in this project only', 'No', 'Experiments, or servers with personal credentials for one repo'],
        ],
      },
      callout: { type: '', md: '**Guide vs docs:** the exam guide contrasts *project* (`.mcp.json`) with *user-level* (`~/.claude.json`) for personal/experimental servers. The Claude Code docs add that `claude mcp add` defaults to **local** scope, which is also stored in `~/.claude.json` but tied to one project. When the same server name is defined in several scopes, **local > project > user** wins, and the whole entry is used (fields are not merged). A classic onboarding bug: someone ran `claude mcp add` without `--scope project`, so the server never reached `.mcp.json` or teammates.' },
    },
    {
      h: 'Environment variable expansion for credentials',
      md: "Commit the *shape* of the integration, never the secret:\n\n" +
        "```\n// .mcp.json (committed)\n{\n  \"mcpServers\": {\n    \"github\": {\n      \"type\": \"http\",\n      \"url\": \"https://api.githubcopilot.com/mcp/\",\n      \"headers\": { \"Authorization\": \"Bearer ${GITHUB_TOKEN}\" }\n    },\n    \"jira\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"example-jira-mcp\"],\n      \"env\": {\n        \"JIRA_URL\": \"${JIRA_URL:-https://acme.atlassian.net}\",\n        \"JIRA_TOKEN\": \"${JIRA_TOKEN}\"\n      }\n    },\n    \"deploy\": {\n      \"type\": \"http\",\n      \"url\": \"${DEPLOY_MCP_URL:-https://deploy-mcp.internal.acme.dev}/mcp\"\n    }\n  }\n}\n```\n\n" +
        "- `${VAR}` expands to the variable's value. `${VAR:-default}` uses the default when it is unset.\n" +
        "- Expansion works in `command`, `args`, `env`, `url` and `headers`.\n" +
        "- If a variable is unset and has no default, the config **still loads**. The literal text is used and Claude Code shows a warning in `/mcp` / `claude mcp list`, so an auth failure usually means a missing export.\n" +
        "- As a safety measure, Claude Code does not expand certain of its own credential variables (e.g. `ANTHROPIC_API_KEY`) into a remote server's url/headers. That stops a cloned repo from sending your credentials to a server it names.\n\n" +
        "Project-scoped servers also need **per-user approval** in interactive sessions, so a cloned repository cannot silently start servers on your machine. (Non-interactive `-p` and SDK runs load them without asking, so review `.mcp.json` changes in code review.)",
      callout: { type: 'warn', md: 'Never paste a real token into `.mcp.json` "just for now". It is a committed file. Rotating the token after it reaches git history is the only real fix.' },
    },
    {
      h: 'Discovery: every server\'s tools at once, so descriptions compete',
      md: "When a session starts, Claude Code connects to each configured server and asks it for its tools (and resources and prompts). Tools from **all** servers are then available **at the same time**, next to the built-in tools, named `mcp__<server>__<tool>`. Two consequences:\n\n" +
        "- **Tools compete with each other.** The model picks by description (see [tool descriptions](#/concept/cca-tool-descriptions)). Built-ins like Grep, Read and Bash are familiar and well described, so a vague MCP tool loses even when it is more capable. **Improve the MCP tool's description**: say what it can do that the built-ins cannot (cross-repo scope, semantic matching, live data), what it returns, and when to prefer it.\n" +
        "- **Many servers mean many tools.** Current Claude Code enables **tool search** by default: only tool names (and server instructions) load at start, and full definitions load on demand. Clear names and front-loaded descriptions matter even more there. Claude Code also truncates very long descriptions. The exam guide's simpler picture, \"all tools discovered at connection time and available simultaneously\", is still the right mental model.\n\n" +
        "**Community vs custom servers.** For standard systems such as Jira, GitHub, Slack, Sentry and Postgres, an established community or vendor server already handles auth, pagination and API changes, and is maintained by others. Build a **custom server** only where your team's workflow is unique (your release gates, your internal data model). That is where your engineering time pays off.",
      table: {
        headers: ['Need', 'Choose', 'Why'],
        rows: [
          ['Search and update Jira issues', 'Community/vendor Jira server', 'Standard API; maintained; no reason to rebuild'],
          ['GitHub PRs and code search', 'Official GitHub MCP server', 'Covers auth, rate limits, API evolution'],
          ['Promote a build through *your* 4 release gates', 'Custom team server', 'Workflow exists only in your org'],
          ['Read your internal runbook tree', 'Custom server exposing resources', 'Team-specific content and structure'],
        ],
      },
    },
    {
      h: 'Resources: show the catalog instead of making the agent explore',
      md: "MCP **tools** are *model-controlled* actions. MCP **resources** are *application-driven* content, each identified by a URI (`file://`, `git://`, or custom schemes like `issue://` and `schema://`), listed with `resources/list` (name, title, description, mimeType) and read with `resources/read`. Parameterized families use **resource templates** (`resources/templates/list`, e.g. `issue://{id}`). Servers can notify clients when the list or an individual resource changes.\n\n" +
        "Why this matters for agents: without a catalog, the model has to *discover* what exists through trial-and-error tool calls (\"search docs for 'rollback'\"... \"list folder X\"... \"search again\"). Exposing a **content catalog** as resources, such as issue summaries for the sprint, the documentation hierarchy or a database schema, tells the agent up front what is available and where. It can then read exactly what it needs.\n\n" +
        "In Claude Code, users attach resources with `@server:protocol://path` mentions (e.g. `@postgres:schema://orders`), and the model can list and read them through built-in MCP resource tools.",
      table: {
        headers: ['Primitive', 'Controlled by', 'Example', 'Good for'],
        rows: [
          ['Tool', 'Model (it decides to call)', '`create_issue`, `promote_build`', 'Actions and parameterized queries'],
          ['Resource', 'Application / user (browse, attach)', '`schema://orders`, `issue://PAY-142`', 'Catalogs and reference content the agent should be able to see'],
          ['Prompt', 'User (invokes as a command)', '`/mcp__jira__triage`', 'Reusable workflows exposed as slash commands'],
        ],
      },
    },
  ],
  antiPatterns: [
    'Configuring a team-wide server at user or local scope, so teammates never receive it.',
    'Hard-coding API tokens in a committed .mcp.json instead of using ${VAR} expansion.',
    'Putting experimental or personal servers in the shared .mcp.json, where they affect every teammate.',
    'Writing a custom MCP server for a standard system (Jira, GitHub) that a maintained community server already covers.',
    'Leaving MCP tool descriptions vague, so the agent keeps using Grep/Bash instead of the more capable MCP tool.',
    'Making the agent discover content through repeated search/list calls when a catalog could be exposed as resources.',
    'Assuming field-level merging when the same server name is defined in several scopes. The highest-precedence entry replaces the others.',
  ],
  keyPoints: [
    'Project scope = .mcp.json at the repo root, committed and shared. User scope = ~/.claude.json, personal across projects. Local scope (the default) = ~/.claude.json for one project.',
    'Use ${VAR} / ${VAR:-default} expansion in command, args, env, url and headers to keep secrets out of version control.',
    'Tools from all configured servers are discovered at connection and available together, so they compete on description quality.',
    'Improve MCP tool descriptions (capabilities, outputs, when to prefer) so the agent doesn\'t default to built-in Grep.',
    'Use community servers for standard integrations. Build custom servers for team-specific workflows.',
    'Expose content catalogs (issues, docs trees, schemas) as MCP resources to cut down on exploratory tool calls.',
    'Project-scoped servers require user approval in interactive sessions. Precedence on name clash: local > project > user.',
  ],
  pitfalls: [
    'An unset env var silently becomes the literal "${JIRA_TOKEN}" string, which looks like an auth bug. Check /mcp warnings.',
    'Too many servers with overlapping tools (two "search" tools) bring back misrouting. Namespace and describe.',
    'Large tool outputs: Claude Code caps MCP output (MAX_MCP_OUTPUT_TOKENS, default 25,000 tokens) and saves big results to files.',
    'Running `claude -p` in CI loads project servers without the approval prompt, so review .mcp.json changes carefully.',
  ],
  realWorld: [
    'Teams commit .mcp.json with GitHub, Sentry and Jira servers so every engineer and CI job gets the same tools.',
    'Database MCP servers expose table schemas as resources, so agents write correct SQL without probing the database.',
    'Claude Code itself can run as an MCP server (`claude mcp serve`) for other clients.',
  ],
  related: ['cca-tool-descriptions', 'cca-mcp-errors', 'cca-tool-distribution', 'cca-builtin-tools', 'ai-agents-tool-use', 'authentication-authorization', 'api-design'],
  quiz: [
    {
      q: 'Your team added a Sentry MCP server last week, but new hires say Claude Code has no Sentry tools. The engineer who set it up ran `claude mcp add sentry ...` with no other flags. What is the most likely cause and fix?',
      options: [
        'Sentry does not support MCP. Use a REST wrapper.',
        'New hires need to restart their laptops.',
        'The server was added at the default local scope (stored in that engineer\'s ~/.claude.json). Re-add it with `--scope project` so it is written to the repo\'s .mcp.json, then commit it with a ${SENTRY_TOKEN} placeholder.',
        'Add the Sentry server to each new hire\'s CLAUDE.md.',
      ],
      answer: 2,
      explain: 'The default scope is local, which is private to one user and project. Shared tooling belongs in project-scoped .mcp.json committed to git, with credentials via env expansion. Restarting will not create config that does not exist. CLAUDE.md holds instructions, not MCP server definitions.',
    },
    {
      q: 'A pull request adds `.mcp.json` containing `"headers": {"Authorization": "Bearer ghp_live_8f..."}`. What should the reviewer require?',
      options: [
        'Replace the literal token with `${GITHUB_TOKEN}`, have each developer and CI export their own token, and rotate the leaked token since it is now in git history.',
        'Approve it. The repo is private.',
        'Move the file to `.claude/settings.json`.',
        'Base64-encode the token.',
      ],
      answer: 0,
      explain: 'Env var expansion keeps the shared config committable without secrets. A token that has been committed must be rotated. Private repos still leak through forks, clones and logs. settings.json is also committed and is not where server definitions go. Base64 is encoding, not protection.',
    },
    {
      q: 'You want to try a new, unstable MCP server for generating architecture diagrams in every project you work on, without affecting teammates. Where should it go?',
      options: [
        'In each repo\'s .mcp.json',
        'User scope in ~/.claude.json (`claude mcp add --scope user ...`)',
        'In the team\'s shared CI configuration',
        'In a project CLAUDE.md',
      ],
      answer: 1,
      explain: 'User scope is personal and applies across all your projects, which matches "experimental, everywhere, just me". .mcp.json would push the unstable server onto every teammate. CI config and CLAUDE.md are not where interactive MCP servers are defined for you.',
    },
    {
      q: 'An agent answering "which runbook covers X?" makes 6–10 `search_docs` calls per question, guessing keywords to find out which runbooks exist. The runbook tree has about 120 documents with stable titles. What is the most effective improvement?',
      options: [
        'Raise the max tool-call limit.',
        'Ask users to always give the exact runbook filename.',
        'Paste all 120 runbooks into the system prompt.',
        'Expose the runbook tree as MCP resources (URI, title, description per runbook), so the agent sees the catalog and reads the one it needs directly.',
      ],
      answer: 3,
      explain: 'Resources give the agent visibility of what is available without exploratory calls, and it fetches only the relevant content. A higher limit allows more wasted calls. Pasting full contents bloats every request. Pushing the lookup onto users defeats the purpose of the assistant.',
    },
    {
      q: 'Your team\'s MCP server offers `dependency_graph_query`, which resolves call chains across 60 repos. Claude Code keeps using Grep in the current repo and reports incomplete results. The MCP tool works when called explicitly. What should you change first?',
      options: [
        'Disable the Grep tool for everyone.',
        'Rewrite the MCP tool description to state its unique capabilities (cross-repo, resolves aliases and re-exports), its output format, and when to prefer it over Grep.',
        'Rename the MCP server to "aaa-deps" so it appears first.',
        'Add a hook that cancels every Grep call.',
      ],
      answer: 1,
      explain: 'The model chooses between all available tools by description. If the MCP tool\'s strengths are not described, the familiar built-in wins. Disabling or blocking Grep removes a tool that is correct for in-repo text search. Name ordering is not how selection works.',
    },
    {
      q: 'Your org needs agents to (1) create and search Jira issues and (2) run a proprietary 5-stage release-approval workflow. What is the best integration plan?',
      options: [
        'Build one custom MCP server covering both.',
        'Use only built-in Bash with curl for both.',
        'Use an established community/vendor Jira MCP server for (1) and build a custom server only for the release workflow (2).',
        'Wait for a vendor to publish a server for the release workflow.',
      ],
      answer: 2,
      explain: 'Standard integrations are better served by maintained existing servers. Custom work is worth it for team-specific workflows. Rebuilding Jira support costs time and creates maintenance burden. Raw curl via Bash loses typed tool interfaces and good descriptions. No vendor will build your proprietary workflow.',
    },
    {
      q: 'A server named `docs` is defined in the repo\'s .mcp.json with a `url` and an `Authorization` header. A developer also has a local-scope `docs` entry with only a different `url`. Which configuration does Claude Code use for that developer?',
      options: [
        'The local-scope entry in full. Same-named servers are resolved by precedence (local > project > user), and fields are not merged across scopes.',
        'A merge: the local url plus the project\'s headers.',
        'The project entry, because shared config always wins.',
        'Both servers, side by side.',
      ],
      answer: 0,
      explain: 'Per the Claude Code docs, the highest-precedence definition is used as a whole and local beats project. Because there is no field merge, the developer\'s entry has no Authorization header. Shared config does not override personal config, and servers with the same name are not loaded twice.',
    },
  ],
  references: [
    { title: 'Claude Code Docs — Connect Claude Code to tools via MCP (scopes, env expansion, resources)', url: 'https://code.claude.com/docs/en/mcp' },
    { title: 'MCP Specification — Resources', url: 'https://modelcontextprotocol.io/specification/2025-06-18/server/resources' },
    { title: 'MCP Specification — Tools', url: 'https://modelcontextprotocol.io/specification/2025-06-18/server/tools' },
    { title: 'Model Context Protocol — Introduction and server directory', url: 'https://modelcontextprotocol.io/' },
  ],
});
