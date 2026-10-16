---
title: AgentHub 实战手记（五）：给工具调用加上 Hook，让“先等等”真的生效
date: 2026-10-16
categories:
  - 项目实战手记
tags:
  - AgentHub
  - Go
  - Hooks
  - Agent Loop
  - 工具调用
abbrlink: b47bca51ec9945a4b9301b580f28fc72
description: 把执行前检查、执行后观察和结束检查接入 Agent.Run，弄清回调返回值怎样影响真实工具执行，以及不同错误应该由谁处理。
layout: post
comments: true
---

上一篇写权限判断时，我把“允许、询问、拒绝”拆进了独立函数。不过，函数能算出结果，和工具真的会停下来，中间还隔着一步。

想象一下：门口的检查员已经说了“先等等”，里面的工具却照常开工。规则写得再清楚，也只是多了一句提醒。

这次整理的是 10 月 15 日接入 AgentHub 主工程的 Hook。现在，程序在工具执行前会调用登记好的检查，读完结果，再决定要不要进入 `Execute`。工具执行之后和模型准备结束时，也都有了对应的处理位置。

我最想弄清楚的是：**回调把话说出来以后，主流程究竟有没有照着做。**

<!-- more -->

## 先给四个时机安排位置

Agent 的主循环原本就有顺序：组织消息、请求模型、解析回复、执行工具、回填结果。Hook 是在这些确定的位置，调用外部登记的函数。

这一版接入了四种事件：

| 事件 | 触发时机 | 主流程怎样使用结果 |
| --- | --- | --- |
| `UserPromptSubmit` | 第一次请求模型之前 | 将返回的背景追加到消息中，保留原问题；回调报错则结束本次运行 |
| `PreToolUse` | 找到工具后、调用 `Execute` 前 | 阻断或检查失败都会跳过工具，并把未执行的原因反馈给模型 |
| `PostToolUse` | `Execute` 已经返回之后 | 接收真实输出、工具错误和耗时；回调错误单独报告 |
| `Stop` | 模型给出候选最终答案时 | 可以要求继续一轮，也可以允许返回答案；检查报错时不放行候选答案 |

这里的“登记”只是保存函数。把回调放进切片、创建 Agent，都不会让它提前执行。等运行流程走到相应位置，宿主程序才会调用它。

模型仍然负责提出工具请求。什么时候触发 Hook、是否执行工具，则由 Go 程序控制。

## 执行前的检查，要分清阻断和出错

执行前回调接收一次工具请求，返回检查结果和错误。下面是 `hook` 包中的核心类型和回调链实现，省去了包声明与导入部分：

```go
type Call struct {
    ToolName string
    Input    string
}

type Result struct {
    Blocked bool
    Reason  string
}

type PreToolHook func(context.Context, Call) (Result, error)

func RunPreTool(ctx context.Context, call Call, hooks []PreToolHook) (Result, error) {
    if err := ctx.Err(); err != nil {
        return Result{}, err
    }
    for i, callback := range hooks {
        if err := ctx.Err(); err != nil {
            return Result{}, err
        }
        if callback == nil {
            return Result{}, fmt.Errorf("PreToolUse 回调 %d 为空", i+1)
        }
        result, err := callback(ctx, call)
        if err != nil {
            return Result{}, fmt.Errorf("PreToolUse 回调 %d: %w", i+1, err)
        }
        if result.Blocked {
            return result, nil
        }
    }
    return Result{}, nil
}
```

**作用：** 按登记顺序检查同一次请求，遇到第一个阻断或错误就停止。检查正常完成但决定阻断时，返回完整的 `Result`；检查本身无法完成时，返回 `error`。

**技术栈：** Go 的结构体、函数类型和切片，以及标准库 `context`、`fmt`。这里没有文件操作或模型请求，也不依赖第三方库。

**关键用法：** `callback(ctx, call)` 才是真正调用回调。`ctx.Err()` 用来检查取消状态；`fmt.Errorf` 中的 `%w` 保留原始错误，方便调用方继续识别。`Blocked` 决定是否阻断，`Reason` 用于解释，两者不能互相替代。

我觉得这里需要特别留意 `error == nil` 的含义：它只说明检查正常完成。检查可以正常地得出“这次不能执行”，此时就是 `Blocked: true`，同时 `error` 为 `nil`。

反过来，如果查询必要信息失败，也不能顺手把它理解成“没有发现问题，允许执行”。这一版会把它当作检查失败处理。

还有两个容易忽略的小地方。阻断原因为空，并不会解除阻断；而空回调链返回 `Result{}`，只表示没有回调提出阻断，不能证明业务权限已经检查过了。切片里的 `nil` 函数则会被当成配置错误。

## 真正拦住工具的，是主循环里的分支

`RunPreTool` 里的 `return` 只结束这次检查调用。要让工具停下来，还得看 `Agent.Run` 是否使用了返回结果。

下面这段位于模型回复已经解析、工具已经找到之后，仍处在 Agent 的循环内部：

```go
call := hook.Call{ToolName: decision.ToolName, Input: decision.Input}
preResult, preErr := hook.RunPreTool(ctx, call, a.hooks.PreToolUse)
if preErr != nil {
    messages = append(messages, llm.Message{
        Role:    "user",
        Content: "Observation: 工具未执行，执行前检查失败：" + preErr.Error(),
    })
    continue
}
if preResult.Blocked {
    reason := preResult.Reason
    if strings.TrimSpace(reason) == "" {
        reason = "执行前回调阻止了本次调用"
    }
    messages = append(messages, llm.Message{
        Role:    "user",
        Content: "Observation: 工具未执行：" + reason,
    })
    continue
}

toolStarted := time.Now()
observation, toolErr := t.Execute(ctx, decision.Input)
toolElapsed := time.Since(toolStarted)
```

**作用：** 把回调结果落实为执行控制。检查失败或明确阻断时，追加未执行反馈，并跳到下一轮模型请求；只有通过检查，代码才会走到 `Execute`。

**技术栈：** Go 的循环控制、内置 `append`、项目现有的文本 ReAct 消息协议，以及标准库 `strings`、`time`。

**关键用法：** `continue` 跳过的是当前这轮循环剩余部分，因此能越过后面的工具执行。`append` 将反馈写入真正要发给模型的 `messages`；`strings.TrimSpace` 用来判断说明是否为空白。`time.Now()` 和 `time.Since()` 只围绕实际工具调用计时。

这一步把“已经判断”变成了“确实没有动手”。如果这里只打印一句拒绝，然后继续向下执行，工具仍然会运行。

反馈也要说清楚发生了什么。明确阻断时说“工具未执行”；检查出错时说明“执行前检查失败”。不能把两者写成工具业务执行失败，因为这一轮根本没有进入工具。

原因写入 `messages` 后，下一次模型请求才能看到它。控制台里打印了什么，不会自动成为模型的记忆。

## 执行后日志坏了，别把工具结果也改坏

工具执行前后的错误，需要分别处理。执行前检查失败，要挡住动作；执行后观察回调失败时，动作可能早已完成。

这一版把真实执行结果整理成 `ToolReport`，再交给执行后回调：

```go
report := hook.ToolReport{
    Call:    call,
    Output:  observation,
    Err:     toolErr,
    Elapsed: toolElapsed,
}
for _, warning := range hook.RunPostTool(ctx, report, a.hooks.PostToolUse) {
    a.reportHookError("PostToolUse", warning)
}
```

**作用：** 将本次请求、真实输出、工具错误和耗时交给执行后回调。回调产生的警告通过观察器单独报告，不替换工具结果，也不触发工具重试。

**技术栈：** Go 结构体、错误切片和接口类型断言。`ToolReport`、`RunPostTool` 属于项目的 `hook` 包；警告通过可选的 `HookErrorObserver` 接口接入现有观测系统。

**关键用法：** `RunPostTool` 收集回调错误，并继续尝试后面的观察回调。`reportHookError` 只在观察器实现了 `OnHookError` 时报告；`ConsoleObserver` 会打印警告，`NopObserver` 则不输出。工具自身的错误保留在 `report.Err` 中。

例如，Echo 已经返回了文本，随后日志回调写入失败。此时合理的记录是“工具返回了文本，日志发生警告”。如果把工具结果改成日志错误，下一步就可能误以为业务没完成，再执行一次。

当然，工具自身执行失败时，也会进入 `PostToolUse`，因为 `Execute` 的确被调用过。被执行前检查挡住的请求，则不会进入这里。

这些执行后回调适合观察、统计或审计。若某个检查必须决定动作能否发生，就应该放在执行前。执行后的回调不能撤销已经发生的副作用；警告也不会自动加入模型上下文。

## 模型说“答完了”，宿主还能要求再检查

之前一解析出 `Final Answer`，程序就直接返回。现在，这份答案先被当作候选结果，交给 `Stop` 回调。

主循环在最终答案分支中这样处理：

```go
result, err := hook.RunStop(ctx, hook.StopInput{
    Question: question,
    Answer:   decision.FinalAnswer,
}, a.hooks.Stop)
if err != nil {
    return "", fmt.Errorf("结束回调失败: %w", err)
}
if result.Continue {
    messages = append(messages, llm.Message{
        Role:    "user",
        Content: "结束检查要求继续：" + result.Reason,
    })
    continue
}
return decision.FinalAnswer, nil
```

**作用：** 在返回候选答案前增加一次宿主检查。需要继续时，把具体原因写入对话，再请求模型；检查失败时返回错误，不把候选答案当作已通过的结果。

**技术栈：** Go 的结构体、错误包装、消息切片和已有 Agent 循环。这里沿用原来的模型客户端，没有新增一套模型协议。

**关键用法：** `RunStop` 返回第一个要求继续的结果；`Continue: true` 时必须提供非空原因，否则视为检查错误。`StopInput` 同时提供原问题和候选答案。`continue` 回到现有循环，仍受 `maxLoop` 限制，不会额外获得无限重试次数。

演示中，第一次结束检查会要求模型再核对工具反馈。它展示的是“宿主如何要求继续”，还没有实现一个能判断任意答案是否正确的验收器。回调叫什么，与它实际上能检查什么，需要分开看。

`Stop` 也不是所有退出路径都会经过的清理函数。模型请求失败、运行取消或循环耗尽，仍然走各自的错误路径。

## 把回调登记进去，再看它怎样运行

配置入口使用了可选参数。下面摘出演示中创建 Agent 和开始运行的部分；`model`、`echo`、`hooks` 都已在同一个入口中准备好：

```go
a := agent.NewAgent(
    model,
    []tool.Tool{echo},
    5,
    trace.NewConsoleObserver(os.Stdout),
    agent.WithHooks(hooks),
)
answer, err := a.Run(context.Background(), "使用 echo 返回 hello world")
```

**作用：** 将按事件分组的回调配置交给 Agent，然后启动一次运行。登记顺序决定同一组内的回调顺序，触发时机由 `Agent.Run` 决定。

**技术栈：** Go 的可变参数与函数选项模式，以及项目的 `agent`、`tool`、`trace` 包和标准库 `context`、`os`。

**关键用法：** `agent.WithHooks(hooks)` 返回一个创建时应用的配置函数；`NewAgent` 保存这些回调，`Run` 才在对应位置调用它们。原来的四参数构造方式仍然可用。运行过程中不应修改配置中的回调切片。

演示入口是 `cmd/hookdemo`，使用固定回复模型和本地 Echo，不需要模型 API Key。固定的是模型提出的请求；后续回答会读取实际的 Observation，工具是否执行由真实主流程决定。

在项目根目录可以分别运行：

```powershell
go run ./cmd/hookdemo
go run ./cmd/hookdemo -block
go run ./cmd/hookdemo -post-error
```

**作用：** 对照允许执行、执行前阻断、执行后回调报错三种情况，观察同一个请求怎样走过不同分支。

**技术栈：** PowerShell、Go 命令行工具，以及演示程序使用的标准库 `flag`。这个入口只调用本地 Echo，不会处理真实图片或请求外部模型。

**关键用法：** `go run` 编译并运行指定目录；`-block` 打开演示的执行前阻断开关；`-post-error` 让执行后回调返回模拟日志错误。正常运行能看到 Echo 结果；阻断时不会执行 Echo；日志报错时，真实 Echo 结果仍然保留。

## 这一版的优点

- **检查结果有了真正的落点。** 执行前回调返回以后，宿主明确检查错误与阻断状态，再决定是否调用工具。
- **不同错误有各自的去处。** 检查失败、业务工具失败、执行后观察失败分别处理，减少把日志警告误认成业务失败的机会。
- **主流程保留稳定的触发位置。** 补充背景、前置检查、结果观察和结束检查通过回调配置，已有构造方式也能继续使用。
- **测试检查实际行为。** 现有测试会检查阻断后工具有没有被调用、下一次模型输入有没有收到反馈，以及结束检查能否绕过循环上限。

## 还没有补齐的地方

- **真实权限链路仍需业务接入。** 这一版已经有执行前的控制入口，但尚未自动连接上一篇的 `Evaluate`，真实路径事实、用户批准和图片服务规则也没有在这里补齐。现有业务 CLI 默认没有登记回调，演示入口则显式注册了它们。
- **结束检查能力取决于具体回调。** 演示中的“再核对一次”只是展示继续运行的机制，不足以证明回答符合业务要求。
- **回调需要自己控制耗时与共享状态。** 当前按顺序在进程内调用函数，`context` 取消需要回调配合响应；这套机制还没有提供强制中断、运行时热更新或并发隔离。

对我来说，这次最有价值的变化，是终于能沿着一次请求往下看清楚：谁提出动作，谁做检查，谁决定执行，以及真实结果最后怎样回到模型手里。每个返回值在主流程里都有对应的处理，Hook 才算接进了程序。
