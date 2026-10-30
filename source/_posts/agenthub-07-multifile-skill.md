---
title: AgentHub 实战手记（七）：把 Skill 装成一套能运行的文件
date: 2026-10-30
categories:
  - 项目实战手记
tags:
  - AgentHub
  - Skills
  - Python
  - 工具调用
abbrlink: a75d601ef9ce4d428e18d20970788b4f
description: 用订单汇总示例拆清 Skill 的入口说明、业务规则、执行脚本和报告模板，记录文件怎样配合，以及宿主还没有接上的部分。
layout: post
comments: true
---

以前提到 Skill，我容易把注意力都放在那份 Markdown 上：把步骤写清楚，模型照着看，好像就能把事情做好。

但如果任务是“读订单 CSV，生成一份汇总报告”，里面还有字段校验、金额计算和文件输出。说明书可以告诉人怎么做饭，菜总得有人下锅。

10 月 29 日，我在 AgentHub 的独立课程目录里补齐了一个多文件订单汇总示例。这篇沿着它看一遍：入口说明怎样引用规则，脚本怎样处理数据，模板怎样参与生成结果。

先把位置说清楚：这是独立课程示例，尚未接入主入口 `cmd/agenthub`。当前能够直接运行的是 Python 脚本，不能把“技能文件已经存在”理解成 Agent 已经能自动发现和执行它。

<!-- more -->

## 一份技能，把不同职责放进不同文件

这一版的目录很小：

```text
order-summary/
├── SKILL.md
├── references/order-rules.md
├── scripts/summarize_orders.py
├── assets/report-template.html
└── samples/orders.csv
```

**作用：** 将入口说明、统计规则、执行程序、输出模板和演示数据分开。阅读时能看出哪些文件指导操作，哪些文件真正参与运行。

**技术栈：** 普通文件目录、Markdown、Python 标准库、HTML 和 CSV，不需要额外安装统计库。

**关键用法：** 从 `SKILL.md` 找到适用任务与操作步骤，再按引用读取规则文件。`scripts` 中的程序执行统计，`assets` 中的模板控制报告结构，`samples` 只提供演示输入；真实任务应使用实际数据。

这样拆开以后，修改统计口径时，可以先改规则与对应程序；调整报告样式时，可以集中看模板。入口说明不用把所有细节挤成一堵文字墙。

入口文件开头提供名称和用途：

```yaml
name: order-summary
description: 统计订单 CSV 中已支付订单的数量和金额，并生成 HTML 汇总报告。用于用户提供订单 CSV、要求订单汇总或生成统计报告的任务。
```

**作用：** 描述技能叫什么、适合处理什么任务，帮助发现阶段判断是否需要继续读取正文。

**技术栈：** Markdown 入口文件中的 YAML front matter。上面摘出的是实际入口里的字段，完整文件用 `---` 包住这部分。

**关键用法：** `name` 标识技能，`description` 说明触发场景和产物。描述本身不会启动脚本；加载器需要读取这些信息，宿主还需要提供文件读取和程序执行能力。

这一点在当前代码里尤其具体：原有 Go 示例扫描的是 `s07_skill_loading/skills`，新增订单示例放在 `examples/order-summary`。它尚未进入那份自动发现目录。即使把入口加载进模型上下文，相对引用的文件和脚本执行也还需要宿主工具配合。

## 统计之前，先约定什么算一笔有效订单

规则文件要求 CSV 包含 `order_id`、`status`、`amount`。订单编号不能空，也不能重复；状态只能是 `paid`、`refunded`、`cancelled`。只有已支付订单计入数量与金额，其他两种状态计入排除数量。

这个口径描述的是示例中的已支付金额，不能顺手把它改称净收入。退款净额需要另外定义规则。

脚本读一行就校验一行。遇到坏数据会结束本次处理，只有整份数据处理成功以后才生成报告。下面是金额检查的实际片段，位于读取 CSV 行的循环内：

```python
try:
    amount = Decimal(row["amount"].strip())
    if not amount.is_finite() or amount < 0 or amount != amount.quantize(Decimal("0.01")):
        raise ValueError("amount must be finite, nonnegative, and in whole cents")
except (InvalidOperation, ValueError) as error:
    raise ValueError(f"line {reader.line_num}: invalid amount") from error
```

**作用：** 将金额解析成十进制数，拒绝非有限值、负数和不是整分的数值。出错时带上 CSV 行号，方便定位原始输入。

**技术栈：** Python 标准库 `decimal` 与异常处理；外围使用 `csv.DictReader` 按表头读取字段。

**关键用法：** `Decimal` 直接从字符串构造；`is_finite()` 排除无穷与 NaN；`quantize(Decimal("0.01"))` 得到按分表示的值，再与原值比较。`raise ... from error` 保留原始异常关系。这段代码依赖外围已经准备好的 `row` 和 `reader`。

这里没有先转成 `float` 再补救。像 `0.10` 和 `0.20` 这样的输入，从读取到累计都走十进制路径。订单编号去重、状态检查、列数检查则在同一个循环里分别完成。

脚本也没有静默跳过错误行。否则报告表面生成成功，读者却不知道有多少数据被漏掉，后面的解释就很难站稳。

## 模板参与生成，输出文件也有自己的边界

统计成功后，程序把结果填入 HTML 模板。下面摘出实际生成与写入部分：

```python
stats = summarize_orders(args.input)
values = {key: str(value) for key, value in stats.items()}
values["source_name"] = escape(args.input.name)
template = Template(args.template.read_text(encoding="utf-8"))
report = template.substitute(values)
args.output.parent.mkdir(parents=True, exist_ok=True)
with args.output.open("x", encoding="utf-8") as target:
    target.write(report)
```

**作用：** 取得统计结果，将值填入模板，并写出报告。源数据只被读取；目标文件已经存在时，写入会报错。

**技术栈：** Python 标准库 `pathlib`、`string.Template` 与 `html.escape`，输出是普通 HTML。

**关键用法：** `Template.substitute` 替换模板里的占位符，缺少必要值时会报错；`escape` 处理要显示在 HTML 中的数据文件名；`open("x")` 以排他创建模式打开目标，避免覆盖已有报告。模板内容本身来自技能目录中的可信文件。

默认模板的位置根据脚本文件自身定位：由 `__file__` 找回技能根目录，再进入 `assets`。因此，使用者不必先切换到技能目录才能运行它。

入口说明中写“生成报告”，真正把文件写出来的，是这里的程序调用。只有程序成功返回，才有依据向用户说明报告已经生成。

## 在项目根目录实际运行

可以在 AgentHub 根目录选择一个尚不存在的输出文件：

```powershell
$skillRoot = (Resolve-Path ".\learning\learn-claude-code\s07_skill_loading\examples\order-summary").Path
python "$skillRoot\scripts\summarize_orders.py" --input "$skillRoot\samples\orders.csv" --output ".\order-summary-report.html"
```

**作用：** 从技能目录之外启动脚本，读取演示 CSV，并在当前目录生成 HTML 报告。

**技术栈：** PowerShell、Python 3，以及技能中配套的脚本、规则与模板。

**关键用法：** `Resolve-Path` 取得已有技能目录的绝对位置；`--input` 指定 CSV，`--output` 指定新报告。程序成功时打印 JSON 结果，失败时返回非零退出码。重复使用已经存在的输出文件名会被拒绝，需要选择新的文件名。

这个运行方式验证的是脚本及其配套文件能否协同工作。它没有经过真实模型的技能选择，也没有自动完成“发现技能、读取引用、执行脚本”的整条 Agent 路径。

## 这一版的优点

- **职责容易沿文件追踪。** 入口指导流程，规则解释口径，程序完成计算，模板提供报告结构。
- **输入与输出边界明确。** 错误行会使本次处理失败，源 CSV 保持原样，已有报告不会被覆盖。
- **执行结果可以直接核对。** JSON 结果和 HTML 报告来自同一次统计，脚本使用标准库，也方便独立运行。

## 还没有补齐的地方

- **宿主接线仍未完成。** 当前订单示例没有进入 Go 示例默认扫描的技能目录，也没有配置一条自动读取引用并执行脚本的 Agent 工具链。
- **统计口径只覆盖示例合同。** 退款净额、多币种或其他订单状态需要重新设计，不能只修改结果名称就当作已经支持。
- **直接运行不等于模型会用。** 这些验证说明程序能处理给定输入，真实模型能否选对技能、参数和文件，仍需单独评估。

把文件拆开以后，我更容易看清一份 Skill 到底交付了什么：它提供可复用的操作方式，也可以带着执行所需的程序与素材。最终动作仍要由宿主真正调用，结果仍要从实际运行中取得。
