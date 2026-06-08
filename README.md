# StashDash

StashDash is a static, dependency-free yarn stash manager for GitHub Pages. It stores all stash data in the browser with `localStorage`, so no server or build step is required. Image recognition coming soon.

## Features

- Add, edit, delete and search yarn entries
- Track full skeins, rest weights, yardage/meters and stock history
- Dashboard and statistics views
- JSON export/import backups
- Responsive layout for mobile and desktop

## GitHub Pages

Publish the repository root with GitHub Pages. The app uses only relative asset paths and hash routes, so it works from project pages such as `https://user.github.io/repo/`.

## Data

Data is stored locally in the current browser under `yarnstash_v1`. Use `Setup -> JSON exportieren` to create backups before switching browsers or clearing site data.