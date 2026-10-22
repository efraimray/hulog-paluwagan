# =============================================================================
#  Publish this project to GitHub in one go (Windows PowerShell 5.1+ or PowerShell 7).
#  Start it by double-clicking publish-to-github.bat in the same folder.
#
#  What it does:
#    1. Checks that Git and the GitHub CLI (gh) are installed and that you are signed in.
#    2. Creates the public repository (or reuses it if it already exists).
#    3. Commits every file and pushes it to the "main" branch.
#    4. Adds the topics and the "claude-improve" label.
#    5. Tags the version and creates a GitHub release with the installable zip.
#    6. Turns on GitHub Pages so the live demo works.
#  At the end it opens Settings so you can upload the Social preview image.
#  Safe to run again later: after you bump the version, it pushes the changes and
#  makes a new release; it never deletes anything on GitHub.
# =============================================================================

# ---- Project settings (filled in by the nightly showcase run) ----------------
$Slug        = 'hulog-paluwagan'
$ProjectName = 'Hulog Paluwagan Planner'
$Version     = '1.0.0'
$Description = 'Free paluwagan (rotating savings group) planner: kinsenas at katapusan payout schedule, fair seeded bunutan draw, hulog tracker, Messenger-ready summary, CSV and backup. Vanilla JS, works offline.'
$Topics      = @('efraimray-showcase', 'paluwagan', 'savings-group', 'vanilla-javascript', 'pwa', 'offline-first', 'personal-finance', 'philippines')
$DemoPath    = ''   # where the live demo lives inside the repo ('' = site root)
# ------------------------------------------------------------------------------

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Say($text)  { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "    OK  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    !!  $text" -ForegroundColor Yellow }
function Fail($text) {
    Write-Host ''
    Write-Host "STOPPED: $text" -ForegroundColor Red
    Write-Host 'Nothing else was changed. Fix the problem above and double-click the file again.'
    exit 1
}
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Write-Host "Publishing $ProjectName v$Version to GitHub" -ForegroundColor White
Write-Host "Folder: $Root"

# 1. Tools ---------------------------------------------------------------------
Say 'Step 1 of 6: Checking Git and GitHub CLI'
if (-not (Has 'git')) { Fail "Git is not installed. Open PowerShell and run:  winget install Git.Git   then close and reopen PowerShell." }
if (-not (Has 'gh'))  { Fail "GitHub CLI is not installed. Open PowerShell and run:  winget install GitHub.cli   then close and reopen PowerShell." }
Ok 'Git and GitHub CLI found'

gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Warn 'You are not signed in to GitHub yet. A browser window will open: sign in and approve.'
    gh auth login --hostname github.com --git-protocol https --web
    gh auth status *> $null
    if ($LASTEXITCODE -ne 0) { Fail 'GitHub sign-in did not finish.' }
}
gh auth setup-git *> $null
$Owner = (gh api user --jq .login).Trim()
if (-not $Owner) { Fail 'Could not read your GitHub username.' }
$Repo = "$Owner/$Slug"
Ok "Signed in as $Owner"

# 2. Local Git repository -----------------------------------------------------
Say 'Step 2 of 6: Preparing the local Git repository'
if (-not (Test-Path (Join-Path $Root '.git'))) {
    git init -q
    if ($LASTEXITCODE -ne 0) { Fail 'git init failed.' }
    Ok 'Created a new Git repository'
}
git rev-parse --verify HEAD *> $null
if ($LASTEXITCODE -ne 0) { git symbolic-ref HEAD refs/heads/main } else { git branch -M main }
if (-not (git config user.email)) {
    $id   = (gh api user --jq .id).Trim()
    $name = (gh api user --jq '.name // .login').Trim()
    git config user.name  "$name"
    git config user.email "$id+$Owner@users.noreply.github.com"
    Ok "Using commit name '$name' with your private GitHub email"
}
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -q -m "$ProjectName v$Version"
    if ($LASTEXITCODE -ne 0) { Fail 'git commit failed.' }
    Ok "Committed: $ProjectName v$Version"
} else {
    Ok 'No new changes to commit'
}

# 3. Create or reuse the GitHub repository, then push ------------------------------
Say "Step 3 of 6: Creating github.com/$Repo and pushing"
gh repo view $Repo --json name *> $null
$exists = ($LASTEXITCODE -eq 0)
git remote get-url origin *> $null
if ($LASTEXITCODE -ne 0) { git remote add origin "https://github.com/$Repo.git" }
if (-not $exists) {
    gh repo create $Repo --public --description "$Description" --homepage "https://$($Owner.ToLower()).github.io/$Slug/$DemoPath"
    if ($LASTEXITCODE -ne 0) { Fail "Could not create the repository $Repo." }
    Ok 'Repository created (public)'
} else {
    Ok 'Repository already exists, reusing it'
}
git push -u origin main
if ($LASTEXITCODE -ne 0) { Fail 'git push failed. If the GitHub repository already has other commits, open it in GitHub Desktop and pull first.' }
Ok 'Code pushed to main'

# 4. Topics and label ---------------------------------------------------------------
Say 'Step 4 of 6: Adding topics and the claude-improve label'
foreach ($t in $Topics) { gh repo edit $Repo --add-topic $t *> $null }
Ok ('Topics: ' + ($Topics -join ', '))
gh label create claude-improve --repo $Repo --color 10b981 --description 'The nightly showcase run will implement this' --force *> $null
Ok 'Label claude-improve ready'

# 5. Tag, zip and release -------------------------------------------------------
Say "Step 5 of 6: Release v$Version"
$Tag = "v$Version"
git rev-parse -q --verify "refs/tags/$Tag" *> $null
if ($LASTEXITCODE -ne 0) { git tag $Tag }
git push origin $Tag *> $null

gh release view $Tag --repo $Repo *> $null
if ($LASTEXITCODE -eq 0) {
    Ok "Release $Tag already exists"
} else {
    # Build <slug>.zip with the project folder at the top level.
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $ZipPath = Join-Path ([System.IO.Path]::GetTempPath()) "$Slug.zip"
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    $zip = [System.IO.Compression.ZipFile]::Open($ZipPath, 'Create')
    try {
        Get-ChildItem -Path $Root -Recurse -File -Force | ForEach-Object {
            $rel = $_.FullName.Substring($Root.Length).TrimStart('\', '/').Replace('\', '/')
            if ($rel -like '.git/*' -or $rel -like '.github/*' -or $rel -like 'publish-to-github.*') { return }
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, "$Slug/$rel", 'Optimal') | Out-Null
        }
    } finally { $zip.Dispose() }
    Ok "Built $Slug.zip"

    $notes = Join-Path $Root 'CHANGELOG.md'
    if (Test-Path $notes) {
        gh release create $Tag $ZipPath --repo $Repo --title "$ProjectName $Tag" --notes-file $notes
    } else {
        gh release create $Tag $ZipPath --repo $Repo --title "$ProjectName $Tag" --notes "$ProjectName $Tag"
    }
    if ($LASTEXITCODE -ne 0) { Warn 'Could not create the release. You can create it on GitHub: Releases -> Draft a new release.' }
    else { Ok "Release $Tag published with $Slug.zip" }
}

# 6. GitHub Pages -------------------------------------------------------------------
Say 'Step 6 of 6: Turning on GitHub Pages'
gh api -X POST "repos/$Repo/pages" -f 'source[branch]=main' -f 'source[path]=/' *> $null
if ($LASTEXITCODE -eq 0) { Ok 'GitHub Pages turned on (the demo appears in 1-2 minutes)' }
else { Ok 'GitHub Pages was already on (or turn it on in Settings -> Pages: main, /root)' }

$RepoUrl = "https://github.com/$Repo"
$DemoUrl = "https://$($Owner.ToLower()).github.io/$Slug/$DemoPath"
Write-Host ''
Write-Host 'ALL DONE' -ForegroundColor Green
Write-Host "  Repository : $RepoUrl"
Write-Host "  Release    : $RepoUrl/releases/tag/$Tag"
Write-Host "  Live demo  : $DemoUrl"
Write-Host ''
# LAST STEP: Social preview image (GitHub has no API for it) ---------------------
$Parent = Split-Path -Parent $Root
$Candidates = @(
    (Join-Path $Root '.github\social-preview.jpg'),
    (Join-Path $Parent "$Slug-featured.jpg"),
    (Join-Path (Join-Path $HOME 'Downloads') "$Slug-featured.jpg")
)
$Image = $null
foreach ($c in $Candidates) { if (Test-Path $c) { $Image = (Resolve-Path $c).Path; break } }

Write-Host 'LAST STEP (about 30 seconds): add the Social preview image' -ForegroundColor Yellow
Write-Host '  GitHub has no API for this, so it is one manual upload:'
Write-Host '  1. The repository Settings page opens in your browser now.'
Write-Host '  2. Scroll to "Social preview" -> Edit -> Upload an image...'
if ($Image) {
    Write-Host "  3. Choose this image: $Image"
    if ($env:OS -eq 'Windows_NT') {
        try {
            Set-Clipboard -Value $Image
            Write-Host '     The image path is copied: in the file window press Ctrl+V in File name and Enter.' -ForegroundColor Green
        } catch {
            Warn 'Could not copy the path to the clipboard; type or browse to it instead.'
        }
        Start-Process explorer.exe "/select,`"$Image`""
    }
} else {
    Warn "No image found. Looked for .github\social-preview.jpg, ..\$Slug-featured.jpg and Downloads\$Slug-featured.jpg"
}
Start-Process "$RepoUrl/settings"
