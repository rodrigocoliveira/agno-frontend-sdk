// Stage every publishable package whose version is not on npm yet, then tag and create GitHub
// releases. Run by the Release workflow (`bun run release:stage`) with npm trusted publishing;
// a human then approves each staged version on npmjs.com (Staged Packages) or with
// `npm stage approve <stage-id>` — that approval, with 2FA, is what actually publishes.
//
// Idempotent: a version already on npm, or already staged and waiting for approval, is skipped,
// so re-running the workflow (every push to main until the approval happens) is harmless.
//
// DRY_RUN=1 → `npm stage publish --dry-run`, no tags pushed, no releases created.
import { $ } from 'bun'
import { readdirSync, readFileSync } from 'node:fs'

const dryRun = !!process.env.DRY_RUN
const packages = readdirSync('packages')
  .map((dir) => ({ dir: `packages/${dir}`, ...JSON.parse(readFileSync(`packages/${dir}/package.json`, 'utf8')) }))
  .filter((p) => p.name && p.version && !p.private) as { dir: string; name: string; version: string }[]

const staged: string[] = []
for (const p of packages) {
  const spec = `${p.name}@${p.version}`
  const onNpm = (await $`npm view ${spec} version`.nothrow().quiet()).stdout.toString().trim()
  if (onNpm) { console.log(`skip ${spec}: already on npm`); continue }

  const listed = (await $`npm stage list ${p.name} --json`.nothrow().quiet()).stdout.toString()
  if (listed.includes(`"${p.version}"`)) { console.log(`skip ${spec}: already staged, waiting for approval`); continue }

  console.log(`stage ${spec}`)
  if (dryRun) await $`npm stage publish --access public --dry-run`.cwd(p.dir)
  else await $`npm stage publish --access public`.cwd(p.dir)
  staged.push(spec)
}

if (staged.length === 0) { console.log('nothing to stage'); process.exit(0) }
if (dryRun) { console.log(`dry run: would tag and create releases for ${staged.join(', ')}`); process.exit(0) }

for (const spec of staged) {
  const exists = (await $`git tag -l ${spec}`.quiet()).stdout.toString().trim()
  if (!exists) await $`git tag ${spec}`
}
await $`git push origin --tags`
for (const spec of staged) {
  const dir = packages.find((p) => spec.startsWith(`${p.name}@`))!.dir
  await $`gh release create ${spec} --verify-tag --title ${spec} --notes ${`Staged on npm, pending approval. Changelog: ${dir}/CHANGELOG.md`}`.nothrow()
}
console.log(`staged: ${staged.join(', ')} — approve on https://www.npmjs.com/settings/rodrigocoliveira/staged-packages`)
