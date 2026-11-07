# Application accounts without a billing subscription

Cloudflare's Zero Trust Free checkout required a payment method and authorization for usage charges. The owner rejected billing commitments. The default deployment therefore uses Better Auth with the official Drizzle adapter on the existing D1 database; Cloudflare Access is not required or enabled.

Public registration is not exposed. An administrator first grants a membership and creates a private invitation. It carries a random 256-bit token, is stored as a SHA-256 digest, expires after seven days, and is atomically consumed before account creation. The token is sent in a URL fragment, then posted to the API, so it is absent from request URLs. The first administrator's owner-generated link expires after 24 hours. Reissuing an invitation invalidates the earlier one.

Possession of a privately delivered invitation authorizes enrollment for its assigned email. The application does not claim to verify mailbox ownership and sends no email. Administrators must deliver each link privately to its intended recipient. An existing account is never overwritten by an enrollment link.

Better Auth owns password hashing, cookie signing, sessions and password recovery. Its workerd export uses native scrypt through nodejs_compat; passwords require 12–128 characters. Secure HTTP-only SameSite=Strict cookies identify hosted sessions. Session records expire after eight hours and are checked in D1 without a cookie cache. Membership is also checked on every protected request. Revocation removes current sessions and outstanding invitations; password recovery revokes sessions too.

Only an authenticated administrator can generate a recovery link for an active member. The library's recovery token expires after one hour and is consumed once. Recovery links grant account control and must be delivered privately. There is no public email-reset endpoint, social sign-in, MFA or transactional-email dependency in this installation. The deployment owner must preserve account/database access for administrator recovery.

Mutating requests require the exact configured origin. Authentication routes have a 16 KiB body limit, a shared 100-request/minute ceiling and a 15-request/minute IP limit, enforced with D1 transactions. Old limiter keys are pruned after one hour. The sign-in page remains publicly reachable, but private records and images require a valid session and membership.

Browser tests use the real production authentication code with an isolated D1 database and a loopback-only bootstrap wrapper. They verify enrollment, cookie attributes, invitation replay rejection, recovery and replay rejection, role boundaries, revocation, logout, blocked public registration, cross-origin rejection and throttling. The test bootstrap wrapper is absent from the production bundle.

Sources: [Better Auth email/password](https://better-auth.com/docs/authentication/email-password), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [server API](https://better-auth.com/docs/concepts/api).
