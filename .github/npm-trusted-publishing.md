# npm Trusted Publishing

The npm publish workflows use GitHub Actions OIDC instead of a long-lived
`NPM_TOKEN`. Each package must have a matching Trusted Publisher entry on npm
before its first publish after this migration.

For each package (`@nowluma/sdk`, `@nowluma/ui`, and `@nowluma/mcp`), open
the package's npm settings and add a **GitHub Actions** trusted publisher with:

| Field | Value |
| --- | --- |
| Organization or user | `Nowluma` |
| Repository | `Nowluma` |
| Workflow filename | The exact filename below |
| Environment | `Nowluma` |

| Package | Workflow filename |
| --- | --- |
| `@nowluma/sdk` | `sdk-npm-publish.yml` |
| `@nowluma/ui` | `ui-npm-publish.yml` |
| `@nowluma/mcp` | `mcp-npm-publish.yml` |

The workflow job keeps the `Nowluma` GitHub Environment, so the environment
field must match exactly. The workflows grant `id-token: write`, use Node 24
(which provides a recent enough npm CLI), and publish with provenance. They do
not read `NPM_TOKEN`.

After all three entries are saved, rerun the failed workflow runs. Once a
successful publish is confirmed for every package, the obsolete `NPM_TOKEN`
environment secret can be removed from GitHub Actions settings.
