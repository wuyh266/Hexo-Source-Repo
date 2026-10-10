---
title: AgentHub 实战手记（四）：工具想动手，先把权限问明白
date: 2026-10-10
categories:
  - 项目实战手记
tags:
  - AgentHub
  - Go
  - 权限控制
  - 工具调用
  - 单元测试
abbrlink: 91adeb2f7fe0495cb825f6b07dc4a510
description: 从独立的 Evaluate 函数出发，拆清事实、授权和决定，说明图片工具的拒绝优先级、分项确认和原因汇总。
layout: post
comments: true
---

图片缩放能跑起来以后，我又开始琢磨另一个问题：一句“把图片缩放一下”，里面其实藏着好几个动作。

图片可能在允许目录之外，要发送给一个外部服务，保存时还可能覆盖同名文件。任务听起来很简单，真正动手之前，却需要把这些事情分别问清楚。

昨晚新增的独立权限判断，就是在整理这份规则。今天回头看代码，我想把其中的三个角色拆明白：发生了什么、哪些操作已经获批，以及最后应该怎么办。

这一版先完成判断函数 `Evaluate`。它还没有接入 Agent 的执行循环，下面讲的是已经写出的策略逻辑。

<!-- more -->

## 先把事实、授权和决定放在不同的位置

如果把所有信息都塞进一个结构体里，写着写着就容易混淆：文件在目录外，是一个事实；允许访问目录外，是一项授权。两者回答的问题不同。

所以这里分成了三个值类型：

```go
type Facts struct {
    ToolName           string
    TouchesPrivate     bool
    OutsideAllowedArea bool
    ServiceAllowed     bool
    OutputExists       bool
}

type Authorization struct {
    OutsideAccessApproved bool
    ServiceUseApproved    bool
    OverwriteApproved     bool
}

type Decision struct {
    Action  string
    Reasons []string
}
```

**作用：** `Facts` 描述工具及操作条件；`Authorization` 保存已经取得的分项授权；`Decision` 返回这次判断的动作和原因。结果中的 `allow` 表示允许，`deny` 表示拒绝，`ask` 表示还有需要确认的条件。

**技术栈：** Go 的结构体、布尔值、字符串和字符串切片。这一部分没有引入外部库，也没有网络或文件操作。

**关键用法：** 用结构体字面量准备输入，再将它们传给 `Evaluate`。例如，`OutsideAllowedArea: true` 只表示操作涉及允许区域之外；是否已经同意这次访问，要看 `OutsideAccessApproved`。`Reasons` 是切片，可以保存多个原因。

目前这些事实和授权来自可信的模拟输入。真正读取目录规则、检查服务和收集用户授权的部分，还没有接进来。因此不能让模型随手写一个 `true`，就把它当成已经取得了授权。

## 判断顺序要先想清楚，再写 if

这一版的规则可以按顺序理解：先检查工具有没有定义策略，再处理禁止条件，然后才考虑公开检索和图片操作的分项授权。

完整的判断函数是这样的：

```go
func Evaluate(facts Facts, auth Authorization) Decision {
    decision := Decision{}

    if facts.ToolName != "knowledge_search" && facts.ToolName != "image_scaling" {
        return Decision{
            Action:  "deny",
            Reasons: []string{"未定义该工具"},
        }
    }

    if facts.TouchesPrivate {
        return Decision{
            Action:  "deny",
            Reasons: []string{"普通授权不能解除这个禁止"},
        }
    }

    if facts.ToolName == "knowledge_search" {
        return Decision{
            Action:  "allow",
            Reasons: []string{},
        }
    }

    if facts.ToolName == "image_scaling" {
        if facts.OutsideAllowedArea && !auth.OutsideAccessApproved {
            decision.Reasons = append(
                decision.Reasons,
                "访问允许区域之外的图片目标尚未获批",
            )
        }

        if !facts.ServiceAllowed && !auth.ServiceUseApproved {
            decision.Reasons = append(
                decision.Reasons,
                "未被许可的服务还尚未被允许",
            )
        }

        if facts.OutputExists && !auth.OverwriteApproved {
            decision.Reasons = append(
                decision.Reasons,
                "试图覆盖已有内容但是尚未被允许",
            )
        }
    }

    if len(decision.Reasons) > 0 {
        decision.Action = "ask"
    } else {
        decision.Action = "allow"
    }

    return decision
}
```

**作用：** 将一组事实和授权转换成统一的判断结果。未知工具和涉及 private 的操作会提前返回 `deny`；通过前面的检查后，公开知识检索返回 `allow`；图片操作则收集所有尚未获批的条件，最后统一决定 `ask` 或 `allow`。

**技术栈：** Go 的普通函数、值参数、条件分支，以及内置的 `append` 和 `len`。函数根据传入的数据计算结果，不读取文件，不发送请求，也不执行工具。

**关键用法：** `Evaluate(facts, auth)` 返回一个 `Decision`。`append` 用于追加原因，返回的切片需要重新赋给 `decision.Reasons`；`len` 用于判断还有没有未解决的条件。前面的 `return` 会结束当前这次 `Evaluate` 调用，后面的规则不再继续判断。

这里有两个顺序问题需要注意。

首先，private 条件放在公开检索之前。因此，只要 `TouchesPrivate` 为真，即使工具名是 `knowledge_search`，也不会走到后面的允许分支。在当前策略里，三项普通授权也不能解除这个禁止。

其次，这个函数只定义了知识检索和图片缩放的策略。虽然 AgentHub 里还注册了 Echo，但把 `echo` 传给这一版 `Evaluate`，会得到“未定义该工具”的拒绝结果。工具已注册和权限策略已覆盖，是两件需要分别确认的事情。

## 三个条件可以一起出现，别顺手写成 else if

我觉得这里最容易写偏的地方，就是图片工具的三个检查。

图片在允许区域之外、服务尚未获批、输出文件已经存在，这三件事可以同时成立。所以代码使用三个独立的 `if`，按目录、服务、覆盖的顺序，把原因装进同一个切片。

如果写成一串 `else if`，前面的条件成立后，后面的检查就被跳过去了。结果很可能变成：先确认目录，再确认服务，最后才发现还要确认覆盖。一次任务要来回问好几轮，问题就是被遗漏的条件一点点冒出来。

现在先收集全部原因，再统一返回 `ask`，调用方就有机会一次说明这次操作到底缺少哪些授权。

## 一次授权，只解决对应的那一项

下面是一个调用片段，使用同一个 `permission` 包里的类型和函数：

```go
facts := Facts{
    ToolName:           "image_scaling",
    OutsideAllowedArea: true,
    ServiceAllowed:     false,
    OutputExists:       true,
}

decision := Evaluate(facts, Authorization{})
// Action 为 ask，包含目录、服务、覆盖三个原因。

auth := Authorization{OverwriteApproved: true}
decision = Evaluate(facts, auth)
// 仍然是 ask，还需要解决目录和服务的授权。

auth.OutsideAccessApproved = true
auth.ServiceUseApproved = true
decision = Evaluate(facts, auth)
// 当前这些条件都已经解决，Action 为 allow。
```

**作用：** 展示同一组事实在不同授权状态下如何得到不同结果。允许覆盖文件，只会消除覆盖这一项原因，其他尚未获批的操作仍然保留。

**技术栈：** Go 的结构体字面量、字段赋值和函数调用。这里使用模拟值演示规则，没有真正访问目录、调用图片服务或覆盖文件。

**关键用法：** 每次授权变化后，再调用一次 `Evaluate`。判断函数返回本次结果，不会把上一次调用中的授权偷偷保存在内部。调用方需要保留授权状态，并确保它对应正在判断的操作。

这里也能看出 `Decision` 只是一个结果。调用方拿到 `deny` 或 `ask` 后，还需要根据这个结果控制执行。`Evaluate` 里的 `return` 不会自动让另一个函数停止，更不会自动撤回已经发生的文件写入。

## 测试既看动作，也看原因有没有漏

这种独立函数比较适合固定输入测试：准备事实和授权，调用函数，再检查返回值。

现有测试把输入和预期结果放进用例表，核心检查逻辑如下：

```go
for _, tt := range tests {
    t.Run(tt.name, func(t *testing.T) {
        got := Evaluate(tt.facts, tt.auth)

        if got.Action != tt.wantAction {
            t.Errorf("Action = %q, want %q", got.Action, tt.wantAction)
        }

        if len(got.Reasons) != len(tt.wantReasonHints) {
            t.Fatalf("Reasons = %q, want %d reasons",
                got.Reasons, len(tt.wantReasonHints))
        }

        for i, hint := range tt.wantReasonHints {
            if !strings.Contains(got.Reasons[i], hint) {
                t.Errorf("Reasons[%d] = %q, want reason containing %q",
                    i, got.Reasons[i], hint)
            }
        }
    })
}
```

**作用：** 检查最终动作、原因数量，以及原因的关键含义和顺序。只检查 `Action == "ask"` 还不够，因为三个条件都没获批和只剩一个条件没获批，都可能返回 `ask`。

**技术栈：** Go 标准库中的 `testing` 和 `strings`，采用表驱动子测试。代码片段中的 `tests` 是预先准备的用例表，每一项都包含输入、预期动作和预期原因关键词。

**关键用法：** `t.Run` 为每个案例建立有名称的子测试；`t.Errorf` 记录不符合预期的结果；原因数量不对时用 `t.Fatalf` 结束当前子测试，避免继续按错误的索引检查。`strings.Contains` 检查原因中的关键含义，减少测试对完整提示文案的依赖。

这些检查帮助我看清楚三种不同的问题：决定算错了、原因漏了，以及原因顺序变了。独立判断逻辑明确以后，至少这一部分可以反复用固定输入核对。

## 这一版的优点

- **判断和执行分开。** `Evaluate` 只接收数据、返回结果，没有文件和网络副作用，规则可以单独测试，也比较容易沿着输入推演。
- **优先级直观。** 先处理未知工具和禁止条件，再考虑允许与分项确认，阅读代码时能看清楚哪些条件会提前结束判断。
- **原因可以一次汇总。** 图片操作的多个条件分别检查，缺少哪项授权就保留哪项原因，方便调用方把需要确认的事情说完整。

## 还没有补齐的地方

- **事实与授权仍是模拟输入。** 当前函数信任传入值，真实路径、服务许可和用户授权怎样取得，还没有实现。
- **判断尚未接入执行循环。** `Agent.Run` 仍然直接调用工具；目前这份规则不能在实际运行中拦住一次工具调用，也没有接入执行前的 Hook。
- **结果标识还比较朴素。** `allow`、`ask`、`deny` 和原因文案都是字符串，拼写与规则增长后的维护仍有改进空间。

这一版已经把“发生了什么”“获批了什么”“应该怎么办”分别放到了代码里。规则的输入和输出清楚了，也更容易看出哪些能力已经写出来，哪些能力还没有真正接到运行流程上。
