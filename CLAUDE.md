

<!-- MOFLO:INJECTED:START -->
## MoFlo — AI Agent Orchestration

This project uses [MoFlo](https://github.com/eric-cielo/moflo) for AI-assisted development spells.

### FIRST ACTION ON EVERY PROMPT: Search Memory

Your first tool call for every new user prompt MUST be a memory search. Do this BEFORE Glob, Grep, Read, or any file exploration.

```
mcp__moflo__memory_search — query: "<task description>", namespace: "guidance" or "patterns" or "code-map"
```

Search `guidance` and `patterns` namespaces on every prompt. Search `code-map` when navigating the codebase.
When the user asks you to remember something: `mcp__moflo__memory_store` with namespace `knowledge`.

### Spell Gates (enforced automatically)

- **Memory-first**: Must search memory before Glob/Grep/Read
- **TaskCreate-first**: Must call TaskCreate before spawning Agent tool
- **Task Icons**: `TaskCreate` MUST use ICON+[Role] format — see `.claude/guidance/moflo-task-icons.md`

### MCP Tools (preferred over CLI)

| Tool | Purpose |
|------|---------|
| `mcp__moflo__memory_search` | Semantic search across indexed knowledge |
| `mcp__moflo__memory_store` | Store patterns and decisions |
| `mcp__moflo__hooks_route` | Route task to optimal agent type |
| `mcp__moflo__hooks_pre-task` | Record task start |
| `mcp__moflo__hooks_post-task` | Record task completion for learning |

### CLI Fallback

```bash
flo-search "[query]" --namespace guidance   # Semantic search
flo doctor --fix                             # Health check
```

### Full Reference

For CLI commands, hooks, agents, swarm config, memory commands, and moflo.yaml options, see:
`.claude/guidance/shipped/moflo-core-guidance.md`
<!-- MOFLO:INJECTED:END -->
