---
title: Roadmap
description: Next steps for the rewrite kernel, platform validation and release distribution.
tutorial: planned
---

<span id="planned-and-unverified" class="legacy-heading-anchor" aria-hidden="true"></span>

# Roadmap

The next priorities are validating the rewrite kernel, expanding platform coverage, and making releases easier to install and verify.

![Available and unavailable choices in the kernel dialog](/images/tutorials/account-kernel.png)

## Rewrite kernel

The rewrite is not shipped. Use the compatibility kernel for current deployments. Before opening the rewrite to users, verify real-account attach, reconnect, and unload on each supported platform. Keep selection and risk acknowledgement per account, with no silent fallback between kernels.

## Platforms

- **Linux Docker arm64:** test on arm64 hardware, including desktop sign-in, account attachment, and preservation of the full QQ HOME across container recreation. Use the [amd64 installation guide](install-docker.md) for current deployments.
- **Windows x64:** verify native attach, sign-in, and session recovery on Windows. The current launcher is [unsigned](install-native.md#windows); code signing is a separate release milestone.
- **Linux Lite:** verify attach and reconnect on a desktop with the released Lite package.

## Releases and updates

Verify public Linux/amd64 pulls of the versioned images before listing them in the [installer guide](install-docker.md). Download release files and checksums from the [GitHub release page](https://github.com/NowLuma/NowLuma/releases).

<span id="documentation-site" class="legacy-heading-anchor" aria-hidden="true"></span>

Keep the installer and both guides aligned with each platform and tag actually published.

## Display effects {#performance-and-appearance}

Before changing the display defaults, measure glass and motion on real devices and check reduced-motion, reduced-transparency and high-contrast modes.

<span id="verify-yourself" class="legacy-heading-anchor" aria-hidden="true"></span>

## How to help

For account or platform testing, record the version, OS and architecture, setup steps, and which checks passed. Verify session recovery in [the QQ client](data-backup.md#qq-persistence-and-manual-verification) and delivery at the receiving end. See [Development](developing.md#local-validation) before sharing a report.
