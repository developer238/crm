# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The rules in `AGENTS.md` (and the per-area docs it indexes) come first. What follows is
orientation: the commands, and the shape of the system.

## Commands

Bun + Turborepo. Every root script is a `turbo run`, so scope any of them with
`--filter=<workspace>` (`api`, `app`, `agent`, `@crm/db`, `@crm/ui`, …).

```sh
bun install                      # also wires .githooks via `prepare`
docker compose up -d             # Postgres on :5432
bun run db:deploy                # apply migrations
bun run db:seed                  # optional demo pipeline (idempotent)
bun run dev                      # app :3000, api :3001, agent :2000
```

Before pushing — all three run in CI and in the `pre-push` hook:

```sh
bun run check-types              # tsc --noEmit everywhere
bun run lint                     # biome check  (bun run format fixes most of it)
bun run test
```

`git push --no-verify` or `CRM_SKIP_HOOKS=1` skips the hook. The hook needs the Docker
Postgres, because the API and telemetry tests are real integration tests.

Tests are `bun test`. There is no single-test root script — filter to the workspace and
pass a path or `-t`:

```sh
bun run --filter=api test -- src/companies/companies.service.spec.ts
bun run --filter=api test -- -t "leases due rows"
bun run --filter=api test:watch
cd apps/agent && bun test test/lanes.integration.spec.ts
```

`apps/api` preloads `test/setup.ts`; both `api` and `agent` set
`CRM_TELEMETRY_DISABLED=1` for tests, so replicate that if you run `bun test` by hand.

Other things you will need:

| Command | |
| --- | --- |
| `bun run --filter=api trpc:generate` | Regenerate `apps/api/src/generated/server.ts` — **committed**, and `build` must never regenerate it |
| `bun run --filter=api dev:session` | Print a session cookie for a local user (refuses `NODE_ENV=production`) |
| `bun run db:migrate` | Create + apply a migration. Schema changes need one; `db:push` is not a substitute |
| `bun run db:studio` | Prisma Studio |
| `bun run --filter=agent eval` | `eve eval` over `apps/agent/evals` |
| `bun run --filter=agent dispatch` | POST the agent's dispatch schedule once, locally |

## Architecture

Three independent deployments over one Postgres. They agree on `DATABASE_URL` and
`BETTER_AUTH_SECRET` and nothing else; a `BETTER_AUTH_SECRET` mismatch is a redirect
loop, not an error.

| | |
| --- | --- |
| `apps/app` | Next.js App Router front end. tRPC client, nuqs URL state, `proxy.ts` gates |
| `apps/api` | NestJS — HTTP, Better Auth, tRPC routers, mailbox sync. **No intelligence** |
| `apps/agent` | eve app — tools, skills, schedules, sandbox. **All** intelligence |
| `packages/db` | Prisma schema + migrations + the shared client, and a lot of shared domain logic (`@crm/db/blob`, `/images`, `/fields`, `/currency`, `/agent-tasks`, `/workspace`, `/settings`, `/safe-fetch`) |
| `packages/auth` | Better Auth config, the `ALLOWED_SIGN_IN` allow-list, role permissions |
| `packages/ui` | shadcn components and the Tailwind theme — the only place UI is defined |
| `packages/env` | Finds and loads the single root `.env` |

**The API↔agent seam is a table, not an HTTP call.** Nest reports that something
happened by writing an `AgentTask` row (`AgentTriggerService`); the agent leases rows
with `FOR UPDATE SKIP LOCKED` and decides what they mean. The row survives the agent
being down. Anything that looks like "every N minutes, the oldest ten contacts" belongs
in a task's `dueAt`, never in a cron expression. `apps/agent/agent/schedules/dispatch.ts`
splits work into two lanes by `DIRECT_KINDS` (`@crm/db/agent-tasks`): visible kinds
(`brand`, `portrait`) run directly with no model, everything else gets one eve session.

**The app↔API seam is a generated type.** `nestjs-trpc` compiles the NestJS routers into
`apps/api/src/generated/server.ts`, which `apps/app` imports as `api/app-router`. If the
front end can't see a procedure you just added, you did not regenerate. `bun run dev`
keeps it in watch mode.

**Single tenant, deliberately — there is no `organizationId` on any CRM record.** A
singleton Better Auth `organization` row (id `WORKSPACE_ID`, the literal `workspace`)
answers only what we are called, who works here and what we sell. The id is a constant,
never a parameter. The workspace slug in the URL (`/comp-ai/companies`) is cosmetic;
`proxy.ts` is the only thing that puts it on.

**Every outside source is optional and must never throw.** A missing key removes a
capability and the agent is told at session start which ones exist —
`apps/agent/agent/lib/capabilities.ts` is the pattern. The sandbox has `deny-all` egress
and is never given `DATABASE_URL`.

## Working in this repo

- `.agents/skills/` has a skill for most of what you will touch — `eve`, `nestjs-trpc`,
  `prisma-database-setup`, `better-auth-best-practices`, `shadcn`, `nuqs`, `turborepo`.
  Read the relevant one first, and say which you read.
- eve's own docs ship at `apps/agent/node_modules/eve/docs` and match the installed
  version. `apps/app/AGENTS.md` says the same about Next.js — this Next has breaking
  changes from training data; read `node_modules/next/dist/docs/`.
- New env vars go in `.env.example` **and**, if the API reads them,
  `apps/api/src/config/env.validation.ts`. If a build reads one, it also needs declaring
  in `turbo.json` — Turborepo strips undeclared vars silently and the build succeeds
  having read `undefined`.
- Branch from `main`, not the default `release`. PRs target `main`; `release` only ever
  takes the two release PRs. Include the Median task ID in commit messages and PR titles.
