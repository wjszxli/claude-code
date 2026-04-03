```
1。 启动时 & 注册
cli.tsx
|
▼
main() ---> 启动的起点，做一些初始化的工作
|
▼
main.tsx
    |
    ▼
    main() ---> 主要的执行函数
      └─ initBundledSkills() ---> 注册内置的 skills
      └─ setup() ---> 注统一初始化编排器，工作目录切换和配置加载
      └─ getCommands() ---> 开始拉取配置
        └─ loadAllCommands(cwd)
         └─ getSkills(cwd)
        ├─ getSkillDirCommands(cwd) ——> 磁盘 I/O，遍历 .claude/skills/
        ├─ getPluginSkills() ——> 插件提供的 skill
        ├─ getBundledSkills()  —— 同步读 initBundledSkills 函数中填充好的内存数组
        └─ getBuiltinPluginSkillCommands() ---> 内置的插件 skill
      └─ getDynamicSkills() ---> 会话中途动态发现的 skill
      → Command[] (最终命令列表) 
```