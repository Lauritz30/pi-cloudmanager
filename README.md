# pi-cloudmanager

rclone integration for the [pi coding agent](https://pi.dev) — browse, read, copy, sync, move and delete files across any [rclone remote](https://rclone.org/) (OneDrive, S3, SFTP, Google Drive, Dropbox, WebDAV, …).

> Status: npm-installable pi package (TypeScript, loaded natively by pi — no build step). The `rclone` CLI does the heavy lifting; this extension wraps it with typed, safety-gated tools.

## Why rclone instead of a bespoke API client?

rclone already provides 80+ storage backends, credential handling, and a battle-tested transfer engine. This extension deliberately does **not** re-implement any of that. It:

- exposes rclone's remotes as first-class, discoverable tools,
- adds safety gating (`open` / `confirm` / `readonly`) around destructive operations,
- adds footer status + a `/rclone-doctor` health check, consistent with your other pi extensions.

## Installation

First install and configure rclone itself:

```bash
brew install rclone
rclone config          # add a remote, e.g. OneDrive
rclone listremotes     # confirm it shows up
```

Then install the extension:

```bash
pi install npm:pi-cloudmanager
# or from git:
pi install git:github.com/Lauritz30/pi-cloudmanager
# one-off session:
pi -e npm:pi-cloudmanager
```

## Quick Start

1. Add a remote: `rclone config` → `n` (new remote) → name it e.g. `onedrive` → pick type `onedrive` → follow the OAuth flow.
2. Create `~/.pi/agent/pi-cloudmanager.json` (optional — only holds policy, not credentials):

```json
{
  "defaultRemote": "onedrive",
  "safetyLevel": "confirm"
}
```

3. Run `/rclone-doctor` to verify the binary, remotes, and connectivity.

### Example configuration

```json
{
  "defaultRemote": "onedrive",
  "safetyLevel": "confirm",
  "remotes": [
    { "name": "onedrive", "safetyLevel": "confirm" },
    { "name": "backup", "safetyLevel": "readonly" }
  ]
}
```

Remotes themselves always live in rclone's config file (`~/.config/rclone/rclone.conf`, or `$RCLONE_CONFIG`). The `remotes` array in `pi-cloudmanager.json` is only a per-remote *policy overlay* — it never stores credentials.

## Tools

### Read

| Tool | Description |
| --- | --- |
| `rclone_doctor` | Check binary, config, remotes, and connectivity |
| `rclone_list_remotes` | List configured remotes (the available sources) |
| `rclone_list_dirs` | List directories (folders only) |
| `rclone_list` | List files/dirs with size & modtime; recursion, depth, include/exclude |
| `rclone_cat` | Read a file's content (optional byte range) |
| `rclone_size` | Object count and total bytes under a path |
| `rclone_about` | Storage quota/usage (when the backend supports it) |
| `rclone_config_show` | Show rclone config with secrets obfuscated |

### Write (safety-gated)

| Tool | Description |
| --- | --- |
| `rclone_mkdir` | Create a directory |
| `rclone_copy` | Copy source → destination (non-destructive) |
| `rclone_move` | Move source → destination (deletes source after transfer) |
| `rclone_sync` | Make destination an exact mirror of source (**destructive**) |
| `rclone_delete_file` | Delete a single file |
| `rclone_delete` | Delete all files under a path (optional `--rmdirs`) |
| `rclone_purge` | Delete a directory and all its contents |

Every write tool supports `dryRun: true` to preview the exact command without executing it.

## Commands

| Command | Description |
| --- | --- |
| `/rclone-status` | Show current status (binary, active remote, safety level) |
| `/rclone-doctor` | Check installation, config, remotes, and connectivity |

## Prompt templates

| Template | Description |
| --- | --- |
| `/rclone-find` | Locate files across remotes |
| `/rclone-backup` | Back up the current project to a remote |
| `/rclone-transfer` | Move/copy/sync between remotes and local |

## Safety model

Three levels, mirroring your other extensions:

| Level | Behaviour |
| --- | --- |
| `readonly` | All write tools are blocked. |
| `confirm` | Write tools prompt for approval via the UI; without a UI they are blocked unless a `headlessApprovals` rule matches. |
| `open` | Write tools run without prompting. |

Set the level globally with `safetyLevel`, or per remote via the `remotes` array. A remote can additionally restrict writes to `allowedRoots` path prefixes — mutations outside those prefixes are always blocked.

### Headless write approvals

In `confirm` mode, writes from a non-interactive run are blocked unless a matching rule exists:

```json
{
  "defaultRemote": "onedrive",
  "safetyLevel": "confirm",
  "remotes": [
    {
      "name": "onedrive",
      "headlessApprovals": [
        { "action": "rclone_copy", "paths": ["backups"] },
        { "action": "rclone_sync", "paths": ["site"] }
      ]
    }
  ]
}
```

A rule matches when `action` equals the tool name, `remote` (if set) equals the target remote, and `paths` (if set) contains the target path. Paths match on prefix: `"backups"` matches `backups/project-2024`.

## Configuration reference

`~/.pi/agent/pi-cloudmanager.json`

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `defaultRemote` | string | — | Remote used when a tool call omits `remote`. |
| `safetyLevel` | string | `"confirm"` | Global default: `"open"`, `"confirm"`, or `"readonly"`. |
| `mock` | boolean | `false` | Skip live connectivity checks in `rclone_doctor`. |
| `remotes` | array | `[]` | Per-remote policy overlays: `{ name, safetyLevel?, allowedRoots?, headlessApprovals? }`. |

Environment variables:

| Variable | Purpose |
| --- | --- |
| `RCLONE_BINARY` | Override the `rclone` binary path. |
| `RCLONE_CONFIG` | Override the rclone config file location (handled by rclone itself). |

## Development

```bash
npm install
npm test
npm run check
```

Run against a local checkout from anywhere with:

```bash
pi install /absolute/path/to/pi-cloudmanager
# or, for a one-off session:
pi -e /absolute/path/to/pi-cloudmanager
```

## Requirements

- Node.js 22.19+
- pi coding agent
- `rclone` CLI on `$PATH`

## License

MIT — see [LICENSE](LICENSE).
