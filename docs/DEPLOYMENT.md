# Deployment

Hulog Paluwagan Planner is a static site: HTML, CSS and JavaScript files. There is nothing to compile and no server code.

## Easiest: double-click (Windows)

`publish-to-github.bat` publishes the whole project to GitHub in one go.

**One-time setup** (open PowerShell once and run):

```powershell
winget install Git.Git
winget install GitHub.cli
```

Close and reopen PowerShell after installing.

**Every time:**

1. Extract the project to a folder, for example `C:\Users\YodnoX\Documents\_Codes\hulog-paluwagan`.
2. Double-click `publish-to-github.bat`.
3. The first time, a browser window asks you to sign in to GitHub and approve the GitHub CLI.
4. The script prints six steps:
   1. checks Git and GitHub CLI and your sign-in
   2. creates the local Git repository and commits the files
   3. creates `github.com/<you>/hulog-paluwagan` (public) and pushes `main`
   4. adds the topics and the `claude-improve` label
   5. tags `v1.0.0` and publishes a release with `hulog-paluwagan.zip`
   6. turns on GitHub Pages
5. At **ALL DONE** it prints the repository, release and live demo links. Then comes the **LAST STEP**: it copies the path of `.github\social-preview.jpg` to the clipboard, shows the image in File Explorer and opens the repository **Settings** page. Scroll to **Social preview -> Edit -> Upload an image...**, press **Ctrl+V** in the File name box and **Enter**. (GitHub has no API for this one step.)

Running it again is safe. It only pushes new commits and creates a release for a new version number.

## With GitHub Desktop

1. File -> Add local repository -> choose the folder -> "create a repository" if asked.
2. Commit all files with the message `Hulog Paluwagan Planner v1.0.0`.
3. Publish repository (untick "Keep this code private").
4. On github.com: Settings -> Pages -> Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`.

## With the git command line

```bash
cd hulog-paluwagan
git init
git add -A
git commit -m "Hulog Paluwagan Planner v1.0.0"
git branch -M main
gh repo create EfraimRay/hulog-paluwagan --public --source . --push \
  --description "Free paluwagan planner: payout schedule, fair bunutan draw, hulog tracker."
gh api -X POST repos/EfraimRay/hulog-paluwagan/pages -f "source[branch]=main" -f "source[path]=/"
```

## GitHub Pages

The app lives at the repository root, so the live URL is:

```
https://efraimray.github.io/hulog-paluwagan/
```

The single-file build is also available at `/demo/`. Pages can take 1-2 minutes after the first push.

## Releasing a new version

1. Make your changes and run `npm test`.
2. Bump the version everywhere it appears:
   - `js/hulog-core.js` -> `var VERSION = 'x.y.z';`
   - `package.json` -> `"version"`
   - `sw.js` -> `var CACHE = 'hulog-vx.y.z';` (so phones fetch the new files)
   - `index.html` footer (`appVersion` default text)
   - `publish-to-github.ps1` -> `$Version = 'x.y.z'`
   - README badge
3. Add a dated entry at the top of `CHANGELOG.md`.
4. Run `node tools/build-demo.js` to refresh `demo/index.html`.
5. Double-click `publish-to-github.bat`. It commits, pushes, tags `vx.y.z` and creates the release.

Manual alternative:

```bash
git commit -am "Hulog Paluwagan Planner v1.1.0"
git tag v1.1.0
git push origin main --tags
gh release create v1.1.0 --notes-file CHANGELOG.md
```

## Custom domain

1. In your DNS, add a `CNAME` record: `paluwagan.yourdomain.com -> efraimray.github.io`.
2. On GitHub: Settings -> Pages -> Custom domain -> enter `paluwagan.yourdomain.com` -> Save, then tick **Enforce HTTPS** when it becomes available.

## Shared hosting (cPanel)

1. Zip the project folder (or use the release zip).
2. cPanel -> File Manager -> `public_html` (or a subfolder such as `public_html/paluwagan`) -> Upload -> Extract.
3. Visit `https://yourdomain.com/paluwagan/`. HTTPS is needed for the offline/install feature; the planner itself works on plain HTTP too.

## Other static hosts

- **Netlify / Cloudflare Pages:** connect the GitHub repo, leave the build command empty, publish directory `/`.
- **Single file:** send or upload `demo/index.html` alone; it contains everything (offline install is not available in the single-file version).

## Data and privacy

There is no backend. Each person's groups are stored in their own browser (`localStorage`). Remind organizers to use **Share & backup -> Download backup** before clearing browser data or changing phones.
