# /clear: Architecture Decision Driven Simplification

## Overview

Create a complete, self-contained directory at `/clear` that explains the Claude Code project's architecture through 10 key design decisions. Each decision is a self-contained learning unit with ADR documentation, simplified implementation, and test-as-documentation.

## Target Audience

Human developers learning the codebase. Progressive complexity, detailed comments explaining design decisions, each decision independently runnable.

## Directory Structure

```
clear/
├── README.md
├── package.json (vitest + zod)
├── vitest.config.ts
├── tsconfig.json
├── decisions/
│   ├── 01-immutable-state/       # createStore<T> pattern
│   ├── 02-self-describing-tools/ # Tool<Input,Output> interface
│   ├── 03-layered-permissions/   # deny > allow > ask > default
│   ├── 04-tool-registry/         # runtime discovery + context filtering
│   │   └── concrete/             # bash, file, agent tool examples
│   ├── 05-message-passing/       # async mailbox with pub/sub
│   ├── 06-typed-commands/        # Prompt | Local | LocalJSX union type
│   ├── 07-task-lifecycle/        # pending→running→completed/failed/killed
│   ├── 08-agentic-loop/          # async generator* query loop
│   ├── 09-ide-bridge/            # protocol-based CLI↔IDE communication
│   └── 10-skill-loading/         # multi-source skill discovery
```

## Decision Details

### 01: Immutable State Store
- **Problem**: React/Ink re-renders need reference equality checks
- **Pattern**: `createStore<T>` with immutable updates + listener subscription
- **Original files**: `state/AppStateStore.ts`, `state/store.ts`
- **Files**: types.ts, store.ts, store.test.ts

### 02: Self-Describing Tools
- **Problem**: LLM needs to discover tool capabilities at runtime
- **Pattern**: `ToolDef<Input,Output>` → `buildTool()` → `Tool<Input,Output>`
- **Original files**: `Tool.ts`
- **Files**: types.ts, factory.ts, factory.test.ts

### 03: Layered Permissions
- **Problem**: Different trust levels need progressive gate tightening
- **Pattern**: explicit deny > explicit allow > ask > default allow
- **Original files**: `utils/permissions/`
- **Files**: permissions.ts, permissions.test.ts

### 04: Tool Registry
- **Problem**: Runtime tool discovery with context-based filtering
- **Pattern**: `Map<name, Tool>` with enabled/denied filtering
- **Original files**: `tools.ts`
- **Files**: registry.ts, registry.test.ts, concrete/{bash,file,agent}.{ts,test.ts}

### 05: Message Passing
- **Problem**: Decouple async tool execution from UI updates
- **Pattern**: Mailbox class with send/poll/receive/subscribe
- **Original files**: `utils/mailbox.ts`
- **Files**: mailbox.ts, mailbox.test.ts

### 06: Typed Commands
- **Problem**: Different execution models (prompt, local, JSX) need unified dispatch
- **Pattern**: Discriminated union `Command` type + registry + slash parser
- **Original files**: `types/command.ts`, `commands.ts`
- **Files**: types.ts, registry.ts, slash.ts, registry.test.ts, slash.test.ts

### 07: Task Lifecycle
- **Problem**: Background operations need formal state management
- **Pattern**: State machine with transitions + task types + polling
- **Original files**: `Task.ts`, `tasks.ts`
- **Files**: task.ts, task.test.ts

### 08: Agentic Loop
- **Problem**: LLM tool-calling is iterative by nature
- **Pattern**: Async generator yielding messages in a loop
- **Original files**: `QueryEngine.ts`
- **Files**: engine.ts, engine.test.ts

### 09: IDE Bridge
- **Problem**: CLI and IDE need decoupled, protocol-based communication
- **Pattern**: Request/response protocol over transport abstraction
- **Original files**: `bridge/`
- **Files**: bridge.ts, bridge.test.ts

### 10: Skill Loading
- **Problem**: Extensibility needs discovery, not hardcoded imports
- **Pattern**: Multi-source loading + dedup + security boundaries
- **Original files**: `skills/`
- **Files**: loader.ts, loader.test.ts

## Design Principles

1. Each decision independently testable: `bun test decisions/01-immutable-state/`
2. Tests as documentation: test names describe behavior
3. Zero external dependencies: in-memory mocks only
4. Code budget: ≤100 lines per .ts, ≤80 lines per .test.ts
5. Every README follows ADR format: Problem → Decision → Consequences → Mental Model

## Dependency Graph (Learning Path)

01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10

- 04 depends on 02, 03
- 06 depends on 01, 03
- 07 depends on 01
- 08 depends on 02, 04, 06, 07
- 09 depends on 08
- 10 depends on 06
