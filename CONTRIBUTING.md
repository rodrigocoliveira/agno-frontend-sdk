# Contributing

Thanks for helping. Contributions come in as pull requests from a fork; only the maintainer can
merge to `main`, and every merge goes through review and CI.

## Set up

```bash
bun install
bun run build && bun run typecheck && bun run test          # unit tests
AGNO_PORT=7778 bun run agentos                                # scripted E2E server (e2e/agentos), no API key needed
AGNO_URL=http://localhost:7778 bun run test:e2e               # E2E against it
```

To try changes against a real LLM, run the demo (`bun run demo:server` + `bun run demo:web`, see
[`examples/demo-agentos`](examples/demo-agentos)).

## Open a pull request

1. Fork the repository and branch from `main`.
2. Make the change with tests. `bun run typecheck && bun run test` must pass.
3. If the change touches `packages/*`, add a changeset: `bun run changeset`, pick the package and
   the bump (`patch` / `minor`), and write the one-paragraph note users will read in the CHANGELOG.
   Docs, examples, e2e and CI changes need no changeset.
4. If you quote code from the repo in `guide/`, keep the excerpt verbatim — CI checks that every
   attributed excerpt still matches its source file (`bun run check:guide-excerpts`).
5. Open the PR. CI runs after the maintainer approves the workflow for external contributors.

Releases are cut by the maintainer from the accumulated changesets — see [RELEASING.md](RELEASING.md).

## Ground rules

- Match the wire contract of the pinned `agno` version (see `examples/demo-agentos/pyproject.toml`);
  when in doubt, capture the real payload from a running AgentOS rather than guessing.
- Keep `@rodrigocoliveira/agno-api` stateless and `@rodrigocoliveira/agno-hooks` UI-free.
- Changes to `.github/`, `scripts/` or the root `package.json` scripts get extra scrutiny in review.
