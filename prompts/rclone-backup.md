# Backing up the current project to an rclone remote

- Confirm the target remote with `rclone_list_remotes` (or ask the user which
  remote to use).
- Create a dated destination folder first: `rclone_mkdir` with
  `target: "<remote>:backups/<project>-<YYYY-MM-DD>"`.
- Copy the project into it with `rclone_copy`:
  `source: "."` (the current working directory) → `dest: "<remote>:backups/<project>-<YYYY-MM-DD>"`.
- Use `dryRun: true` first, then run without `dryRun` so the safety prompt
  confirms before anything is copied.
- Verify with `rclone_list` on the destination folder and report the number of
  files copied.
