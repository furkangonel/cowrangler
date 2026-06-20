# Releasing Cowrangler Desktop

This guide explains how to produce the downloadable installers (`.dmg`, `.AppImage`, `.exe`) that the website's **Download** buttons point to.

The download buttons on [cowrangler.com](https://cowrangler.com) link to the repo's **GitHub Releases** page, so a download "just works" once you've published a release with the built artifacts attached.

---

## Option A — Automated, all platforms (recommended)

A GitHub Actions workflow (`.github/workflows/release-desktop.yml`) builds for macOS, Linux, and Windows in parallel and uploads the installers to a GitHub Release automatically.

1. Bump the version in `package.json` (e.g. `2.0.2` → `2.0.3`).
2. Commit, then create and push a matching tag:
   ```bash
   git add package.json
   git commit -m "release: v2.0.3"
   git tag v2.0.3
   git push origin main --tags
   ```
3. The workflow runs on the `v*` tag. When it finishes, a **draft/published Release** with all three installers appears at:
   `https://github.com/furkangonel/cowrangler/releases`
4. If it published as a draft, open the release and click **Publish**.

That's it — the website's download buttons (`/releases/latest`) now serve the new installers.

> The workflow uses the built-in `GITHUB_TOKEN` — no secrets to configure. The tag version (`v2.0.3`) must match `package.json`'s `version` (`2.0.3`).

---

## Option B — Local build (current OS only)

Produces installers for **your machine's OS** into `release/`:

```bash
npm run desktop:release
```

This installs deps, rebuilds `better-sqlite3` for Electron, bundles the app, and runs `electron-builder` (without publishing). Then drag the artifacts into a GitHub Release manually, or publish from the CLI:

```bash
# Publish the local build to GitHub Releases (needs a token):
export GH_TOKEN=ghp_your_personal_access_token   # repo scope
npx electron-builder --publish always
```

---

## Output

| Platform | Artifact | Built on |
|----------|----------|----------|
| macOS | `Cowrangler-<ver>-arm64.dmg`, `-x64.dmg`, `.zip` | macOS runner |
| Linux | `Cowrangler-<ver>.AppImage` | Ubuntu runner |
| Windows | `Cowrangler-Setup-<ver>.exe` | Windows runner |

Targets and naming are configured in `package.json` → `build`.

---

## Code signing & notarization (optional, later)

Builds are currently **unsigned** (`mac.identity: null`), so they work without Apple/Microsoft certificates. Users open them via right-click → Open (macOS) or "More info → Run anyway" (Windows). To ship signed/notarized builds later:

- **macOS:** set `CSC_LINK` (base64 `.p12`) + `CSC_KEY_PASSWORD`, and `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` as GitHub secrets; set `mac.identity` to your Developer ID and `hardenedRuntime: true`.
- **Windows:** set `CSC_LINK` + `CSC_KEY_PASSWORD` with a code-signing cert.

The first-run unsigned-app steps are documented in [README.desktop.md](./README.desktop.md#download).

---

## Pre-flight checklist

- [ ] `package.json` `version` bumped and matches the tag.
- [ ] `build.publish.owner/repo` matches your actual GitHub repo (`furkangonel/cowrangler`).
- [ ] `assets/icon.png` exists (1024×1024). Icons for every platform are derived from it.
- [ ] App boots locally: `npm run desktop:dev`.
- [ ] At least one API key set so the agent responds on first launch.
