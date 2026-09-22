# Transferring files between rclone remotes (and local)

- To move/copy between two remotes, pass both as full specs, e.g.
  `rclone_copy(source: "onedrive:docs", dest: "s3:archive/docs")`.
- Local paths are plain filesystem paths (e.g. `/Users/you/file.txt` or `.`).
- Prefer `rclone_copy` when the source must be kept; use `rclone_move` only
  when the source should be deleted after transfer.
- Use `rclone_sync` only when the destination must become an exact mirror of
  the source — it is destructive and deletes extra destination files.
- Always `dryRun: true` first, then run without `dryRun` so the safety prompt
  confirms the exact command.
