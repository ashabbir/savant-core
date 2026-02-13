---
name: talon-registry
description: Use the Talon Registry CLI to search, install, update, and publish agent skills from talon-registry.com. Use when you need to fetch new skills on the fly, sync installed skills to latest or a specific version, or publish new/updated skill folders with the npm-installed talon-registry CLI.
metadata:
  {
    "talon":
      {
        "requires": { "bins": ["talon-registry"] },
        "install":
          [
            {
              "id": "node",
              "kind": "node",
              "package": "talon-registry",
              "bins": ["talon-registry"],
              "label": "Install Talon Registry CLI (npm)",
            },
          ],
      },
  }
---

# Talon Registry CLI

Install

```bash
npm i -g talon-registry
```

Auth (publish)

```bash
talon-registry login
talon-registry whoami
```

Search

```bash
talon-registry search "postgres backups"
```

Install

```bash
talon-registry install my-skill
talon-registry install my-skill --version 1.2.3
```

Update (hash-based match + upgrade)

```bash
talon-registry update my-skill
talon-registry update my-skill --version 1.2.3
talon-registry update --all
talon-registry update my-skill --force
talon-registry update --all --no-input --force
```

List

```bash
talon-registry list
```

Publish

```bash
talon-registry publish ./my-skill --slug my-skill --name "My Skill" --version 1.2.0 --changelog "Fixes + docs"
```

Notes

- Default registry: https://talon-registry.com (override with CLAWHUB_REGISTRY or --registry)
- Default workdir: cwd (falls back to Talon workspace); install dir: ./skills (override with --workdir / --dir / CLAWHUB_WORKDIR)
- Update command hashes local files, resolves matching version, and upgrades to latest unless --version is set
