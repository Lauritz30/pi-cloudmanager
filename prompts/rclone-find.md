# Finding files in rclone remotes

- When the user asks for a file but does not name the remote, call
  `rclone_list_remotes` first to see what is available, then search the
  most likely remote.
- Use `rclone_list_dirs` to navigate the folder hierarchy cheaply, then
  `rclone_list` (optionally with `include`/`exclude` glob patterns) to find
  files. Prefer `recursive: true` with `maxDepth` for a bounded deep search.
- Read matches with `rclone_cat`. For large files, read a preview with
  `offset`/`count` instead of pulling the whole file.
- Return a short answer with the full `remote:path` of each relevant file so
  the user can act on it later.
