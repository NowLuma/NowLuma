---
title: Practice demo
description: 'The /demo/ environment in the documentation site: learn the workspace using guided example data without connecting a real QQ account.'
tutorial: demo
---

# Practice demo

Use a chapter lesson for guided steps or open the [standalone simulator](/demo/) to explore the workspace.

![Tutorial guidance alongside the actual console](/images/tutorials/simulator-guide.png)

Both use the console interface with sample data. The first-run lesson starts at sign-in; other lessons may start with a sample account already selected.

## Opening it

- Select **Load simulator** above the chapter and follow the prompts. Collapse the simulator and choose **Resume simulator** to pick up where you left off. **Restart tutorial** resets the lesson; **Full page** opens a separate copy in a new tab.
- The simulator follows the chapter's language. Enter the sample password and code shown in the lesson.

## What you can practise

| Scenario                                                                              | Chapter                                                 |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Floating navigation, masthead, connection workflow, runtime readings                  | [Workspace](overview.md)                                |
| Four-stage setup: notices, access password, manual display effects and account kernel | [First run](first-run.md)                               |
| Process states and the attach confirmation                                            | [QQ sessions](qq-connection.md)                         |
| Four transport tabs and save states                                                   | [Bot connections](onebot-config.md)                     |
| Log presets, search and the TRACE warning                                             | [Run log](logs.md)                                      |
| Action testing, message composition and live activity                                 | [Debug tools](debug.md)                                 |
| Settings categories and save/restart hints                                            | [Settings: appearance and account](settings-console.md) |

<span id="what-it-cannot-prove" class="legacy-heading-anchor" aria-hidden="true"></span>

## Moving to your own console {#differences-from-the-real-console}

The simulator keeps changes in memory and sends no requests to QQ or a bot. For your own deployment, follow [First run](first-run.md) to sign into Nowluma, then [QQ sessions](qq-connection.md) to attach the account you signed into in QQ. Confirm the endpoint and check your bot's logs after [connecting it](onebot-config.md).
