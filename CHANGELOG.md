# Changelog

## Unreleased

Added Better Auth password accounts, single-use invitations, private administrator-issued recovery links, session revocation and shared authentication throttling. Cloudflare Access is no longer required. The first administrator sets their own password through an owner-generated setup link.

Added a copyable team workspace link and membership-revocation coverage. Replaced the default R2 dependency with private D1 image storage for Workers Free installations: 1 MiB per image, 100 MiB shared media capacity, and transactional rollback on rejected uploads. Existing R2 installations must migrate their images before upgrading. Added quota tests, account onboarding instructions and stable Git line endings for Windows.

## 0.1.0-rc.1

First local release candidate with D1-backed editorial review, R2 media storage, platform caption variants, scheduled cloud dispatch, conservative retry handling, Buffer adapter and responsive React workspace. Cloud authentication, live publishing and NGO-owned GitHub configuration require installation-specific verification.
