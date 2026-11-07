# Cloudflare deployment and first launch

Use an NGO-controlled Cloudflare account on Workers Free. Resource names below are examples for a new installation. This version stores both records and images in D1 and requires no R2 subscription. Installation and tests create no remote resources.

## 0. Set up the account

Open [Cloudflare signup](https://dash.cloudflare.com/sign-up). Use an identity controlled by the installation owner. The signup screen offers Google, GitHub and Apple sign-in, or email and password. Complete sign-in, any human verification, and email verification directly in the browser. Keep passwords and verification codes out of repository files, issues and chat.

Once the dashboard opens, continue to Workers & Pages. This deployment can use a Cloudflare-provided `workers.dev` address; buying or transferring a domain is not required. Keep the Workers Free plan for the initial installation unless the owner approves an upgrade.

Dashboard sign-in and Wrangler authorization are separate steps. From the repository, run `pnpm exec wrangler login`, review the requested permissions in the browser, then check the selected account with `pnpm exec wrangler whoami`. If a device authorization code expires, start a new login instead of reusing it. Multiple Cloudflare accounts require an explicit choice before creating resources.

Keep R2 and Workers Paid disabled for a zero-spend installation. D1 Free rejects operations at its quota instead of charging overages. Leave Cloudflare Access/Zero Trust disabled too: its checkout can require a billing authorization. This app provides its own invited accounts through Better Auth. Account creation alone does not deploy the workspace.

References: [Create a Cloudflare account](https://developers.cloudflare.com/fundamentals/account/create-account/), [Workers CLI setup](https://developers.cloudflare.com/workers/get-started/guide/), [D1 Free limits](https://developers.cloudflare.com/d1/reference/faq/).

## 1. Create isolated resources

Use Node 24 and pnpm from the repository's packageManager field. Install with `pnpm install --frozen-lockfile`. Log in using `pnpm exec wrangler login`. Provision a D1 database with `pnpm exec wrangler d1 create studio`. Images use the same database and remain private behind the application's authorization checks.

Copy `wrangler.jsonc` to an ignored `.local/wrangler.production.json` **only if you also adjust its relative main, assets and migrations paths**. Alternatively set the D1 ID and production resource names in the tracked root config. Use separate resource names, authentication secrets and Worker for staging. Keep staging's Buffer key absent until a specifically authorized test. Local development always uses local bindings.

The commands below assume the root config. For another config add `--config PATH` to each Wrangler command. Set `vars.APP_ORIGIN` to the exact HTTPS workspace origin, `vars.BUFFER_ORG_ID` to the authorized Buffer organization and `vars.MEDIA_ORIGIN` to the HTTPS origin that serves this Worker's delivery path. The example env file is a reference. The frontend reads none of these values.

## 2. Deploy and create the first account

1. Build reviewed source with `pnpm build`. Inspect the bundle with `pnpm exec wrangler deploy --dry-run`. Keep preview URLs disabled and use the exact configured hostname for sign-in.
2. Apply all five migrations to the intended database with `pnpm exec wrangler d1 migrations apply DB --remote`.
3. Deploy with `pnpm exec wrangler deploy` after environment approval. Before authentication is configured, private APIs deny access. Record the generated workers.dev origin, then set `vars.APP_ORIGIN` and `vars.MEDIA_ORIGIN` to that origin.
4. Generate a cryptographically random secret of at least 32 bytes and store it with `pnpm exec wrangler secret put AUTH_SECRET`. Keep it out of tracked config and chat. Redeploy the configured Worker. The sign-in page and approved delivery routes are public; the API verifies sessions and membership itself.
5. Run `node scripts/bootstrap-admin.ts admin@example.org https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev .local/wrangler.production.json`, substituting the intended email, origin and exact config path. This creates the first administrator only for an empty membership table, or enrolls the already-designated active administrator. It refuses to overwrite an existing account. Open the private URL in `.local/admin-setup-link.txt` and have the owner choose their password in the browser. The link is single-use and expires after 24 hours. Do not commit or publicly share that file.
6. In Settings, set the organization name and IANA timezone. Grant each teammate a role and privately share their invitation link. Invitees choose their own passwords. Email is an account identifier; invitation possession authorizes enrollment, and mailbox ownership is not independently verified. Invitations expire after seven days. Existing members can receive a one-hour setup/recovery link. Share recovery links only with the named member: they grant account control. Revocation removes active sessions and unused invitations.

Public registration and public reset-email endpoints are unavailable. Keep at least two trusted administrators after onboarding. Administrators can issue recovery links for each other. If every administrator loses access, the deployment owner must use a controlled database recovery procedure; do not open public registration or remove membership checks. Preserve a backup and record the recovery action.

## 3. Connect Buffer

Connect the NGO LinkedIn Page, Instagram professional account and Facebook Page in Buffer. Select the right organization using the official API explorer's `{ account { organizations { id name } } }` query. The key can reach more than one organization. This installation filters channel discovery to the configured ID and accepts one eligible channel per platform. Resolve duplicate eligible channels before syncing.

Store the key using `pnpm exec wrangler secret put BUFFER_API_KEY`. Use the hidden prompt. Go to Settings → Sync channels and compare the names with the NGO's intended destinations. Locked, disconnected or paused channels are skipped. Publishing becomes available for an approved post when its selected destinations are connected. The browser never receives the key.

## 4. Verify before publishing

- Sign in and sign out with each real role. Check session expiry and denied access from an uninvited identity and a request without a valid session cookie.
- Upload a nonconfidential test image. Confirm private media returns an authorization error in an anonymous window. Validate D1 persistence, image bytes and content type.
- Confirm scheduled triggers are active under Worker Triggers. Record the production Worker version, migration numbers and account limits.
- First use the deterministic local suite. A live end-to-end test requires separate explicit authorization for the image, caption, channels and time. During an authorized staging handoff verify that Buffer can fetch the exact delivery URL without authentication. Check the actual network post, its Buffer ID and each final status before accepting production.
- Monitor Worker errors, queue age, unknown jobs, D1 storage/operations and Buffer quotas. Recheck limits before launch and when volume changes.
- Set the NGO's retention policy, operational contact and member-facing privacy/terms text before general use.

## Failure handling and recovery

For unknown with an external ID, leave the job in reconciliation and inspect the same ID in Buffer. Without an ID, compare the channel, caption, media and UTC time in Buffer and the social network. Capture evidence in a private incident record. Never requeue or recreate an ambiguous job without resolving whether it published. Automatic matching by caption alone would risk a duplicate. Restore missing secrets or channel permissions before using a displayed retry. For a full queue, wait for a slot or free one in Buffer.

Export a protected D1 backup with `pnpm exec wrangler d1 export studio --remote --output PRIVATE_BACKUP.sql` into an approved restricted directory. It includes image BLOBs as well as editorial records. Keep its timestamp, migration version, secret references and restoration instructions. Images and delivery tokens in the database are sensitive. Use the account's available D1 Time Travel retention and rehearse in staging.

**Restore drill.** Pause the cron or remove the Buffer key before restoring. Restore D1 into an isolated database, verify row counts, foreign keys, representative image hashes, sign-in, draft thumbnails and event histories. Confirm `media_storage.used_bytes` equals `SUM(length(data))` in `media_bytes`. Reconcile every in-flight or post-backup job with Buffer before enabling dispatch. A database rollback alone can recreate already submitted work. Re-enable production only after the operator records the outcome.

**Earlier R2 installations.** Migration 0004 adds D1 image storage but does not copy old R2 objects. Before upgrading an installation that has uploads, export and retain its media, copy eligible images into `media_bytes` using the original media IDs, and verify their hashes and the storage counter in staging. The new per-image limit is 1 MiB; larger legacy images need a separately reviewed migration. Keep the previous deployment and storage until that migration is verified. An empty first installation requires no copy.

**Media capacity.** Uploads stop at 100 MiB of image bytes. An operator can export and remove unused media records only after confirming that no post or job references them. Deleting the metadata cascades to its bytes and reclaims capacity. There is no automatic deletion of team content. A member-facing archive tool is a future improvement.

## Capacity

Workers Free lists 100,000 requests/day and 10 ms CPU per request or cron invocation. D1 Free limits each database to 500 MB and imposes daily read/write quotas; exhausted quotas reject operations. This app further caps each image at 1 MiB and all media at 100 MiB, reserving space for records and database overhead. The API and database both enforce the image limit, and a transactional trigger enforces shared capacity. Upload and media responses must also fit the Free CPU allowance; test representative graphics on the actual deployment. Keep Workers Free selected so an exceeded quota stops service rather than creating a paid overage. There is no automatic plan upgrade in this app.

Buffer Free supports up to three connected channels and ten queued posts per channel at once. Buffer also enforces request windows. Keep the Buffer account on Free. There is no paid AI requirement.

[Worker limits](https://developers.cloudflare.com/workers/platform/limits/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) · [Buffer queue capacity](https://support.buffer.com/en-us/articles/how-many-posts-can-i-schedule-in-advance-Kmy2IEecqm) · [Buffer API limits](https://developers.buffer.com/guides/api-limits) · [Better Auth security](https://better-auth.com/docs/reference/security)
