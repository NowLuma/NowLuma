---
title: Practice mode (integration pending)
description: The planned simulated environment for practising console operations — what it is, what you can practise, what it cannot prove, and its current status.
---

# Practice mode (integration pending)

> **Status: planned. The page path is reserved at `/demo/` and is not live in this repository yet.**
> This chapter describes what it will provide and the boundaries you must keep in mind. Once the site is wired up, this page will carry a real, clickable entry.

## The problem it solves

On a first run, the hard part is usually not the features themselves but:

- Not daring to press load, unload or “trigger crash” because a live bot might break.
- Not having a second QQ account to try “send a message”.
- Not being able to tell 「已保存，下次连接时应用」 from 「已保存并应用」, because reproducing both in a real environment is awkward.

Practice mode renders the same interface over **a data set that is explicitly labelled as simulated**, so you can press everything.

## Three boundaries

1. **It is labelled simulated.** The page keeps a permanent marker such as “simulated data — no real QQ connection”, and nothing on it pretends to be real state.
2. **It uses no real credentials.** It asks for no QQ account, no OneBot token and no access password, and it sends no requests to external addresses. It never calls real APIs and never uses dummy passwords that look like real secrets.
3. **It proves nothing about your setup.** “Connected” in practice mode does not mean QQ is signed in on your machine; “sent successfully” does not mean a bot will reply.

## What you will be able to practise

| Scenario | Relevant chapter |
| --- | --- |
| First start: agreements, setting the access password, the 2FA step | [First start](first-run.md) |
| What a failed sign-in and its error banner look like | [First start](first-run.md) |
| Layout editing: drag widgets, change settings, restore defaults | [Overview](overview.md) |
| Presentation (kiosk) mode and the mobile layout | [Overview](overview.md) |
| QQ process state flow: loadable → loading → waiting for sign-in → online | [QQ connection](qq-connection.md) |
| Endpoint save chips: saved and applied / applied on next connection / hot reload failed | [Endpoint configuration](onebot-config.md) |
| Log filtering, presets, reading the TRACE warning | [Logs](logs.md) |
| The difference between read-only and side-effecting actions in the tester | [Debug](debug.md) |
| Settings save and restart notices | [Settings: Nowluma and platform](settings-runtime.md) |

Those branches are exactly the ones the documentation struggles to explain in prose and that are hardest to reproduce safely in a real environment.

## When not to use it

- To check whether your own QQ account can be bridged: that needs the real environment, see [QQ connection](qq-connection.md).
- To check whether your bot replies: test against a real account and real endpoint.
- To check persistence or restart semantics: the simulated environment does not persist, so see [Data, backup and updates](data-backup.md) instead.

## Current status and follow-up

- Page path: `/demo/` (reserved).
- Data: a separate simulated API layer that never touches the real server.
- Entry: once site navigation is wired up, the note at the top of this page becomes a clickable link.
- Upstream dependency: the static-site generator and page shell belong to the publisher, not to this documentation. The documentation's only job is to keep “this is simulated” unmistakable, so no simulated result is mistaken for a real one.

If you just want to see the interface without connecting QQ today: the login page can be viewed on its own (that step connects nothing), while the rest of the console needs a valid session. For real use, walk through [First start](first-run.md) — it usually takes under ten minutes.
