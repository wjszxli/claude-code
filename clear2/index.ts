import { createStateStore, selectors, updaters } from "./core/state";

function header(title: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function section(title: string): void {
  console.log(`\n▸ ${title}`);
}

function kv(key: string, value: unknown): void {
  console.log(`  ${key}: ${JSON.stringify(value)}`);
}

function handleState(): void {
  header("State Pattern: createStore → setState → selectors");

  const store = createStateStore();

  section("初始状态");
  const initial = store.getState();
  kv("model", initial.settings.model);
  kv("permissionMode", initial.settings.permissionMode);
  kv("messages", `${initial.messages.length} 条`);
  kv("tasks", `${Object.keys(initial.tasks).length} 个`);

  section("subscribe — 订阅状态变化");
  let changeCount = 0;
  const unsubscribe = store.subscribe(() => {
    changeCount++;
    console.log(`  [notify #${changeCount}] state changed`);
  });

  section("updaters — 不可变更新");
  store.setState(updaters.setModel("claude-opus-4-20250514"));

  store.setState(
    updaters.appendMessage({
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    }),
  );

  store.setState(
    updaters.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "Hi there" }],
      timestamp: Date.now(),
    }),
  );

  store.setState(
    updaters.registerTask({
      id: "b_test0001",
      type: "local_bash",
      status: "pending",
      description: "npm test",
      startTime: Date.now(),
    }),
  );

  section("selectors — 状态查询");
  const state = store.getState();
  kv("getModel", selectors.getModel(state));
  kv("getMessages", `${selectors.getMessages(state).length} 条`);
  kv("getActiveTasks", `${selectors.getActiveTasks(state).length} 个`);
  kv("isStreaming", selectors.isStreaming(state));

  section("updaters — 任务状态推进");

  store.setState(updaters.updateTaskStatus("b_test0001", "running"));
  store.setState(
    updaters.updateTaskStatus("b_test0001", "completed", Date.now()),
  );

  kv("completed tasks", Object.keys(store.getState().tasks).length);

  unsubscribe();

  section("设计要点");
  console.log("  - 单一 AppState: 唯一真相源");
  console.log("  - 不可变更新: setState(updater) 创建新引用");
  console.log("  - selectors: 纯函数查询状态切片");
  console.log("  - subscribe: 发布-订阅通知 UI");
}

// function handleTools(args: string[]): Promise<void> {
//   const verbose = args[0] === "-v" || args[0] === "--verbose";
// }

async function handleEcho(args: string[]): Promise<void> {
  const message = args[0] ?? "";

  if (!message) {
    console.error("Error: message is required");
    console.log('Usage: bun run clear/index.ts echo "your message"');
    process.exit(1);
  }

  header("Tool Pattern: buildTool → call → ToolResult");
  section("Input");
  kv("message", message);

  section("buildTool 工厂");
  // console.log(`  name: ${EchoTool.name}`);
  // console.log(`  isReadOnly: ${EchoTool.isReadOnly({ message })}`);
  // console.log(
  //   `  isConcurrencySafe: ${EchoTool.isConcurrencySafe({ message })}`,
  // );
  // console.log(`  interruptBehavior: ${EchoTool.interruptBehavior()}`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  console.log(`command is :${command}`);
  const args = process.argv.slice(3);

  switch (command) {
    case "echo":
      handleEcho(args);
      break;
    // case "tools":
    //   await handleTools(args);
    //   break;
    case "state":
      handleState();
      break;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
