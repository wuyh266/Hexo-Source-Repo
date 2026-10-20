---
title: AgentHub 实战手记（六）：给任务列一张清单，但别把打勾当成做完
date: 2026-10-20
categories:
  - 项目实战手记
tags:
  - AgentHub
  - Go
  - 任务规划
  - Agent Loop
  - 工具调用
abbrlink: e782139cb46b4d459ebeced5201e68d2
description: 把 todo_write 组装进现有 Agent 循环，拆解完整清单校验、每次运行的状态隔离和遗漏提醒，说明计划状态与真实完成之间的边界。
layout: post
comments: true
---

做一件事时，脑子里记着“先查资料，再整理答复”还算轻松。事情一多，查到一半去处理别的，再回来，就容易忘掉刚才停在哪里。

Agent 处理多步骤任务时，也需要一个地方记下：准备做什么，正在做什么，还有什么没处理。

这次整理的是 10 月 19 日完成的 Todo 主程序集成。新增的 `todo_write` 已经进入 AgentHub 原有的工具表，与知识检索共用模型循环、Hooks 和运行观察器。命令行入口也能直接运行这套流程。

不过，给一件事打勾很容易，确认它真的做完要难一些。这一版的清单负责保存状态和发出提醒，完成标记仍由调用方提交，业务结果还得另外核对。

<!-- more -->

## 先说清楚：这次提交的是整张清单

`todo_write` 接收一个 JSON 对象，其中的 `todos` 是完整清单。例如，查询条款刚开始时，可以提交：

```json
{
  "todos": [
    {"content": "查询拆封耳机退货条款", "status": "in_progress"},
    {"content": "整理并核对带来源的答复草稿", "status": "pending"}
  ]
}
```

**作用：** 一次描述当前任务的全部待办及其状态。成功更新后，旧清单会被这份完整清单替换。

**技术栈：** JSON 数据格式，Go 标准库 `encoding/json` 负责解析，再交给项目中的 Todo 管理器校验与保存。

**关键用法：** `content` 是事项内容，`status` 只能取 `pending`、`in_progress`、`completed`，分别表示待处理、进行中、已完成。更新时要带上仍需保留的所有事项；仅提交其中一项，会使清单只剩下这一项。

这种方式比较直观：模型不用先找到某个编号再发一条修改命令，只要提交当前完整状态。但它也有代价——修改一项时忘了带上其他事项，那些事项就会从清单中消失。

这一版最多保存二十项，同一时刻最多一项处于进行中，事项内容不能是空白。`todos: []` 可以明确清空计划；缺少 `todos` 或传入 `null`，则会被拒绝。解析器也拒绝未知字段，以及在一个对象后继续拼接第二份 JSON 的输入。

## 先检查整张表，别改到一半才发现有问题

假设清单第一项合法，第二项内容却是空的。如果程序边检查边写入，第二项报错时，旧计划可能已经被第一项改掉了。

所以这里先检查全部输入，全部通过以后，再替换内部状态。下面是管理器的实际更新函数，位于 `todo` 包中：

```go
func (m *Manager) Update(items []Item) (string, error) {
    if len(items) > 20 {
        return "", errors.New("待办最多 20 项")
    }
    active := 0
    for _, item := range items {
        if strings.TrimSpace(item.Content) == "" {
            return "", errors.New("待办内容不能为空")
        }
        switch item.Status {
        case "pending", "completed":
        case "in_progress":
            active++
        default:
            return "", fmt.Errorf("未知待办状态: %q", item.Status)
        }
    }
    if active > 1 {
        return "", errors.New("同一时刻最多一项进行中")
    }
    m.mu.Lock()
    defer m.mu.Unlock()
    m.items = append([]Item(nil), items...)
    if len(m.items) == 0 {
        return "当前计划为空。", nil
    }
    lines := make([]string, 0, len(m.items))
    for _, item := range m.items {
        lines = append(lines, item.Status+": "+item.Content)
    }
    return strings.Join(lines, "\n"), nil
}
```

**作用：** 校验数量、内容和状态，通过后一次替换清单，返回便于模型阅读的状态文本。校验阶段返回错误时，不会修改旧清单。

**技术栈：** Go 的结构体切片、条件分支与 `switch`，标准库 `errors`、`fmt`、`strings`，以及管理器内部的 `sync.RWMutex`。

**关键用法：** `strings.TrimSpace` 判断内容是否为空白；`active` 累计进行中事项。`Lock` 与延迟调用的 `Unlock` 保护内部状态，`append([]Item(nil), items...)` 复制切片，避免把外部传入的切片直接保存为内部数据。最后用 `strings.Join` 拼出本次更新结果。

这里的复制也有实际意义。调用方之后再修改原切片中的事项，不应该绕过更新函数，把管理器里的内容一起改掉。读取快照时，`Snapshot` 同样返回一份切片副本。

现有测试会先保存旧计划，再提交包含空内容、未知状态或多项进行中的错误清单，检查报错后原计划是否保留。这样检查的是更新边界，不能只看函数有没有返回错误。

## 每次运行另建计划，别把上一次的事项带进来

Agent 配置中保存着模型和业务工具，但某次任务的待办清单不该一直留在配置里。

这一版通过 `WithTodoPlanning` 启用计划功能。在每次 `Run` 开始时，程序复制工具表，保留已有业务工具，再加入新建的计划管理器和提醒器：

```go
func WithTodoPlanning() Option {
    return func(a *Agent) { a.todoPlanning = true }
}

func (a *Agent) toolsForRun() (map[string]tool.Tool, *todo.Reminder, error) {
    if !a.todoPlanning {
        return a.tools, nil, nil
    }
    if _, exists := a.tools[todo.ToolName]; exists {
        return nil, nil, errors.New("todo_write 由 WithTodoPlanning 按运行创建，请勿重复注册")
    }
    tools := make(map[string]tool.Tool, len(a.tools)+1)
    for name, registered := range a.tools {
        tools[name] = registered
    }
    plan := todo.New()
    tools[plan.Name()] = plan
    return tools, &todo.Reminder{}, nil
}
```

**作用：** 为当前运行准备工具表，并为这次任务单独创建清单与提醒计数。没有启用计划功能时，继续使用原有工具表。

**技术栈：** Go 的函数选项模式、`map`、接口值，以及项目中的 `agent`、`tool`、`todo` 包。

**关键用法：** `WithTodoPlanning()` 返回创建 Agent 时应用的选项；`todo.New()` 创建当前运行的管理器，`&todo.Reminder{}` 创建新的提醒计数。工具表复制的是登记关系，已有业务工具对象仍然保留；新建的是计划与提醒状态。重复手动注册 `todo_write` 会报错，避免静默覆盖。

主入口在已经准备好模型、业务工具、观察器和 Hooks 后，这样创建 Agent：

```go
a := agent.NewAgent(llmClient, tools, 10, observer,
    agent.WithHooks(hooks), agent.WithTodoPlanning())
```

**作用：** 在现有 Agent 上同时启用回调配置和待办功能。模型看到的工具说明与后续分发使用同一份运行期工具表。

**技术栈：** Go 的可变参数，配合项目现有的 `NewAgent` 与配置函数。

**关键用法：** 将 `agent.WithTodoPlanning()` 作为可选参数传入构造函数。这里的 `10` 是模型循环上限，计划更新与业务动作都要在同一个预算内完成。启用计划工具不会强制所有简单问题先列清单，是否调用它仍取决于模型回复。

这次也把工具执行集中到了 `executeTool`。计划更新与政策检索都经过工具查表、执行前 Hook、真实执行、运行观察和执行后 Hook，没有给待办另开一条跳过检查的路。

主入口现在显式登记了执行后回调，可以观察计划工具和业务工具的实际结果；真实文件权限策略与用户批准流程仍未在这里自动接入。

## 提醒看“有没有更新成功”，不能只看工具名字

清单存好了，也可能被晾在一旁：模型连续查询资料，却一直没更新计划。

这里加入了一个简单的提醒器。连续三个工具调用轮次没有成功更新计划，就返回一段提醒：

```go
type Reminder struct{ rounds int }

func (r *Reminder) AfterRound(toolName string, succeeded bool) string {
    if toolName == ToolName && succeeded {
        r.rounds = 0
        return ""
    }
    r.rounds++
    if r.rounds < 3 {
        return ""
    }
    r.rounds = 0
    return "计划提醒：已经连续三个工具调用轮次没有成功更新计划，请核对原目标和剩余事项。"
}
```

**作用：** 记录未成功更新计划的工具调用轮次，达到阈值后生成提醒。计划更新成功时清零；发出提醒后也重新计数。

**技术栈：** Go 的结构体方法、整数计数和布尔判断。提醒器是当前运行中的内存对象，没有定时器或后台任务。

**关键用法：** `AfterRound(toolName, succeeded)` 同时需要工具名和实际成功状态。只有调用 `todo_write` 且执行成功，才算完成一次计划更新。参数校验失败、未知工具、执行前被阻断，都不会因为“尝试过调用”就清零。

例如，模型提出了一次 `todo_write`，却漏掉了必需字段。这次更新没有保存成功，提醒计数就应该继续。如果只判断工具名，反复提交错误参数也能一直逃过提醒。

这里的“三轮”指三个工具调用轮次。一个请求即使因未知工具或前置阻断而没有真正执行，也会计入；这不是三次成功业务操作，更不是每隔三秒检查一次。

## 提醒写进消息以后，下一轮才看得见

提醒器返回字符串还不够。主循环必须把它放进真正要发送给模型的消息里：

```go
observation, succeeded := a.executeTool(ctx, step, decision, tools)
messages = append(messages, llm.Message{
    Role:    "user",
    Content: "Observation: " + observation,
})
if reminder != nil {
    if text := reminder.AfterRound(decision.ToolName, succeeded); text != "" {
        messages = append(messages, llm.Message{Role: "user", Content: text})
    }
}
```

**作用：** 回填本次工具结果，再根据执行状态更新提醒器；有提醒时，一并加入后续模型输入。

**技术栈：** Go 的多返回值、消息切片和内置 `append`，沿用主项目的文本 ReAct 协议。

**关键用法：** `executeTool` 返回观察文本与成功标记；`AfterRound` 使用成功标记判断计划更新是否完成。`append` 保存提醒，下一次 `Chat` 才能看到它。未启用计划功能时，`reminder` 为 `nil`，跳过这一段。

提醒不会自动多送一次模型请求。如果最后一个允许的轮次刚写入提醒，循环随后耗尽，程序仍会返回错误，不会临时再加一轮。

它也不会自动修改清单。模型读到提醒以后，仍需决定是否更新，以及提交怎样的完整状态。

## 用同一个主入口跑一遍

在项目根目录运行：

```powershell
go run ./cmd/agenthub -demo
```

**作用：** 从主入口观察建立计划、查询本地政策、更新清单、返回答复这一条完整路径。

**技术栈：** PowerShell、Go 命令行工具，以及主项目的本地模型适配器、知识检索、Todo 工具和 Hooks。

**关键用法：** `-demo` 只把模型客户端切换为固定动作序列，不需要模型密钥。工具执行和消息回填仍然真实发生；演示使用固定问题，不能同时传入自定义问题。正常模式仍使用原来的 GLM 客户端，本次没有请求外部模型。

这条演示先把“查询条款”设为进行中，随后用知识工具读取本地售后文档；取得带来源的实际反馈后，整理答复草稿，再更新清单，最后输出资料。

我比较在意其中第二项的措辞：它写的是“整理并核对带来源的答复草稿”。草稿已经准备好时可以标记完成；最终文本真正打印给用户，则发生在之后。这样至少不会在答复还没交付时，就先把“已经交付”勾掉。

固定动作方便重复观察执行路径，但最终资料来自真实的检索反馈。查询失败或没有取得可核对来源时，演示会说明资料不足，不会照着预写好的政策结论回答。它能帮助理解装配过程，不能用来证明真实模型总能规划正确。

## 这一版的优点

- **已经进入主程序。** 计划工具、知识工具、Hooks 和运行统计使用同一个 Agent 循环，清单更新也会进入下一轮模型输入。
- **失败更新有明确边界。** 整表校验通过后才替换状态，错误输入保留旧计划，切片副本也减少了从外部意外修改内部状态的机会。
- **任务之间的计划分别保存。** 每次运行另建计划管理器与提醒器，不会把上次任务的事项和计数直接带到下一次。
- **提醒依据实际成功状态。** 校验失败、未知工具和前置阻断都计入未更新轮次，现有测试也会检查这些失败路径，以及提醒是否进入后续输入。

## 还没有补齐的地方

- **完成状态仍需另外核验。** 当前没有把清单与业务结果自动比对，也没有用待办完成情况拦住最终答案；模型可能过早打勾，甚至在事项未完成时直接结束。
- **计划只保存在本次运行的内存里。** 这一版没有跨运行恢复和持久化。计划与提醒的运行隔离，也不能直接等同于整套服务的多用户隔离。
- **整表更新可能遗漏事项。** 它让输入协议简单，但调用方每次都要保留完整状态；目前没有事项编号或局部更新机制。
- **提醒只提供一次纠偏机会。** 它不会强制模型修复计划，不增加循环预算，也不能保证真实模型在多步骤任务中的规划质量。

清单让我更容易沿着一次运行对照“原来准备做什么”和“现在报告做到哪里”。至于那些勾是否打得准确，还是要回到真实工具结果和用户目标上逐项核对。
