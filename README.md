# 5/3/1 Calculator (PWA)

Your 5/3/1 calculator as an installable iPhone app — no App Store, no Apple fee.

- **Remembers your numbers** on the device (nothing is ever sent anywhere)
- **Backup / restore**: export opens the iOS share sheet → "Save to Files" or AirDrop; restore picks that file again
- **Reminder banner** when your last backup is older than 14 days
- **Works offline** after the first visit

## One-time setup on your Mac

You need Node.js (`brew install node`, or from nodejs.org).

```bash
cd 531pwa
npm install
npm run dev        # opens a local preview; try it in your browser
```

## Releasing

Source and the live site share one public repo. Pushing to `main` triggers a GitHub Action
(`.github/workflows/deploy.yml`) that builds the app and publishes it to GitHub Pages.

```bash
./deploy.sh          # patch release, e.g. 1.1.0 -> 1.1.1
./deploy.sh minor    # new feature, e.g. 1.1.0 -> 1.2.0
./deploy.sh major
```

This bumps the version, commits + tags (`vX.Y.Z`) and pushes. The live site updates about a minute later at
`https://bhvrywm.github.io/531pwa/`. The version is shown at the bottom of the app.
Roll back by checking out an old tag, then re-running the workflow from that code (or `git revert`).

## Install on iPhone

Open the link in **Safari** → Share button → **Add to Home Screen**.
(Friends do the same with your link.)

## Notes

- Data lives in the home-screen app's own storage. **Deleting the app from the home screen deletes the data** — keep backups.
- If you change `REMIND_AFTER_DAYS` in `src/storage.js`, you can make the reminder more or less frequent.
- The repo is public, including the source. It contains no personal data — that lives only on your phone.
