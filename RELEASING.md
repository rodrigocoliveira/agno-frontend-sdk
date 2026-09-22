# Releasing

Both packages (`@rodrigocoliveira/agno-api`, `@rodrigocoliveira/agno-hooks`) are published to npm
from GitHub Actions. Nobody publishes from a laptop after the first release, and there is no npm
token stored anywhere: npm trusts this repository's `release.yml` workflow directly (OIDC
"trusted publishing"), and every published version carries a provenance attestation that links it
back to the exact commit and workflow run.

## Day-to-day: how a change reaches npm

1. **Every PR that changes a package ships a changeset.** Run `bun run changeset`, pick the
   package(s), pick the bump (`patch` / `minor` / `major`), write the one-paragraph note users will
   read in the CHANGELOG. Commit the generated `.changeset/*.md` with the PR.
   A PR that only touches docs, examples, e2e or CI needs no changeset.
2. **Merge the PR.** The Release workflow sees pending changesets and opens (or updates) a PR
   titled **"chore: version packages"**. That PR bumps `package.json` versions, regenerates
   `bun.lock`, writes the CHANGELOGs and deletes the consumed changesets. Nothing is published yet.
   Keep merging feature PRs; the version PR is rebuilt on every push to `main`.
3. **Review and merge the version PR** when you want to cut a release. The Release workflow now
   finds no changesets and versions that are not on npm, so it builds, runs `changeset publish`,
   pushes the `@rodrigocoliveira/agno-api@x.y.z` git tags and creates a GitHub release per package.

`changeset publish` skips any version that already exists on npm, so re-running the workflow is
safe.

## Versioning policy

- Before 1.0: `minor` for anything that changes a public signature or behavior, `patch` for
  everything else. 1.0.0 is reserved for the release that ships `agno-chat`.
- `agno-hooks` declares `agno-api` as a **peerDependency** with an open `>=` range. Bun resolves
  peers against the workspace copy, so the range must always include the *current* workspace
  version (that is why it starts at `>=0.0.0`; a `>=0.1.0` range fails `bun install` with a 404
  until 0.1.0 exists on npm). Raise the minimum only to a version that is already published,
  in the PR where `agno-hooks` starts depending on something new in `agno-api`.
- Changesets' `updateInternalDependencies: patch` only rewrites a range when the new version
  falls outside it; a `>=` range never triggers that, so raise it by hand when needed.

## What guards the release

| Guard | Where |
|---|---|
| Unit + E2E tests, typecheck, generated code up to date | `ci.yml` on every PR and on `main` |
| Human review of the exact versions and CHANGELOGs before anything is published | the version PR |
| No long-lived npm credential to leak | trusted publishing (OIDC), `permissions: {}` by default |
| Provenance: npm shows which commit and workflow built each version | automatic with trusted publishing |
| Only `dist/`, `README.md`, `LICENSE` in the tarball | `files` in each `package.json`; check with `npm pack --dry-run` |

Note: the version PR is created with the built-in `GITHUB_TOKEN`, which by design does **not**
trigger `ci.yml` on that PR. That is fine: the version PR only contains files `changeset version`
generated from commits that already passed CI on `main`. If you ever need CI on it, create a
GitHub App token and pass it as `github-token` (see the changesets/action docs).

## One-time setup (first release)

npm only lets you add a trusted publisher in the settings of a package that already exists, so
the very first version of each package is published by hand, once.

1. **Repository setting:** GitHub → Settings → Actions → General → enable
   *Allow GitHub Actions to create and approve pull requests* (the version PR needs it).
2. **Merge the PR that adds `release.yml`.** The workflow opens the first version PR
   (0.0.0 → 0.1.0 for both packages). Review the CHANGELOGs and merge it. The publish job will
   fail on this first run with an npm auth error — expected, the trusted publisher does not exist yet.
3. **Publish 0.1.0 from your machine** (npm account with 2FA enabled):

   ```bash
   git checkout main && git pull
   npm login
   bun run release
   git push --follow-tags
   ```

4. **Add the trusted publisher to each package** on npmjs.com → package → Settings →
   *Trusted Publisher* → GitHub Actions:

   | field | value |
   |---|---|
   | Organization or user | `rodrigocoliveira` |
   | Repository | `agno-frontend-sdk` |
   | Workflow filename | `release.yml` |
   | Environment | leave empty |

   Do this for `@rodrigocoliveira/agno-api` and `@rodrigocoliveira/agno-hooks`.
5. **Lock the packages down** (same settings page): set *Publishing access* to
   *Require two-factor authentication and disallow tokens*, so only trusted publishing and a
   2FA-authenticated human can publish. Revoke any npm automation tokens you no longer need.

From the next changeset on, steps 1–3 of "Day-to-day" are the whole process.

## Manual fallback

If GitHub Actions is unavailable, a maintainer with 2FA can still run the same commands locally:

```bash
bun run version          # apply changesets, bump versions, refresh bun.lock, write CHANGELOGs
git commit -am "chore: version packages"
bun run release          # build + changeset publish (asks for the 2FA code)
git push --follow-tags
```

## Consuming the packages

```bash
bun add @rodrigocoliveira/agno-api @rodrigocoliveira/agno-hooks react
```

Check provenance of what you installed: `npm audit signatures`.
