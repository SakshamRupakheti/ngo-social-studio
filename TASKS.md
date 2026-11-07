# Release tracker

## Local release candidate

| Milestone              | Delivered                                                                                                                                                                                                                        | Verification and next gate                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation          | Isolated four-package TypeScript workspace, pnpm lockfile, Vite/Worker config, three versioned SQLite migrations, CI definition and MIT license. Foundation commit 6845c23.                                                      | Frozen install passed. Wrangler applied the migrations to fresh local databases. The NGO must supply remote resource IDs.                                                                                                                 |
| 2. Interface           | Responsive editorial desk, private entry, upload and caption composer, channel previews, calendar, lists, media library and settings. Interface commit 966f51d and release refinements in 76ef36a.                               | Chromium checked desktop, tablet and phone layouts. Six actual screenshots live in docs/screens. Production Access sign-in requires NGO configuration.                                                                                    |
| 3. Core workflow       | D1 roles, revisions and audit events, private R2 image storage, approval, rejection, change requests, protected writes and admin settings. Backend commit 75b063c.                                                               | Tests exercised persistent uploads, refresh, unauthorized direct requests, stale approvals, logout and the credential-free app.                                                                                                           |
| 4. Publishing          | Buffer GraphQL discovery, image scheduling and immediate handoff, atomic per-channel jobs, read-back, cooldowns, selective retry, private delivery tokens and supported cancellation. See apps/api/publishing.ts and migrations. | Mock HTTP contract tests and local Worker integration cover acceptance, mixed results, concurrency, cancellation and uncertain responses. Authenticated Buffer discovery, external media fetching and real social delivery await staging. |
| 5. Quality and release | Vitest and Playwright suites, protected deployment instructions, restore drill, privacy and terms pages, GitHub templates, release notes and source archive. Caption regression fixed in 17432b6.                                | Local checks below. GitHub CI, branch policy and production recovery require an NGO-controlled installation.                                                                                                                              |
| 6. Optional AI         | Caption-suggestion interface in packages/shared/assistance.ts.                                                                                                                                                                   | Hosted inference and rewriting are deferred. No AI keys, costs or external model calls are part of this release.                                                                                                                          |

## Verification evidence

- Strict type checking, formatting check and Vite production build passed.
- Biome lint passed with non-blocking style warnings for CSS specificity and non-null assertions.
- 13 Vitest cases passed across validation, JWT verification, authorization boundaries and the Buffer wire contract.
- 7 Playwright cases passed against isolated local Workers, D1 and R2. They cover the eight requested scenarios. Tests also verify private image access, approved image bytes, cancellation, reapproval after edits, reconciliation, logout, responsive navigation, team access revocation and the hosted workspace link.
- A parallel dispatch test issued two worker ticks for the same jobs, preserved the successful platform receipts and refused a retry for the unknown delivery.
- Production dependency audit reported no known vulnerabilities at verification time. Wrangler bundled the production entry and static assets with a dry run.
- All social-network outcomes used in the suite came from the test adapter. Tests never called social accounts.

## Next milestone: NGO staging acceptance

1. Identify the NGO GitHub owner, maintainer team and security contact. Review the local candidate, publish the repository and check CI on GitHub. Activate code ownership and the documented ruleset.
2. Provision isolated Cloudflare staging resources and configure the Access identity policy, session settings, initial administrator and HTTPS delivery origin. Verify login and recovery with real identities.
3. Store the authorized Buffer key as a Worker secret, configure its organization ID and verify the three discovered destinations. Confirm account quotas before scheduling.
4. Run one explicitly approved publication and check media fetching, Buffer receipts and final network delivery per channel. Exercise cancellation only on authorized staging content.
5. Rehearse D1 and R2 restoration with publishing disabled. Confirm the NGO's retention terms, cost monitoring and operational owner before production approval.

## GitHub publication

The source and existing commit history are published at https://github.com/SakshamRupakheti/ngo-social-studio. The main branch contains the initial release candidate, and the team-sharing update is on feat/share-workspace. The v0.1.0-rc.1 tag is also pushed. The account owner is the initial code owner. GitHub CI and repository protection are being verified during publication.

Cloudflare authorization is still required before provisioning the hosted workspace. The administrator address supplied by the owner is stored only in an ignored local bootstrap file. Buffer credentials are also pending. Follow docs/deployment/cloudflare.md for the remaining cloud and live-publishing acceptance steps.
