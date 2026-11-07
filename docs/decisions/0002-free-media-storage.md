# Bounded images on D1 Free

The installation owner requires zero spend and declined usage-based storage billing. R2 activation is therefore excluded. Workers and D1 must remain on Free; service stops at provider limits instead of upgrading automatically.

Migration 0004 stores immutable image BLOBs separately from their metadata. Upload validation accepts PNG/JPEG up to 1 MiB. A D1 batch inserts metadata and bytes in one transaction. SQLite triggers enforce a 100 MiB shared media budget and maintain the byte counter on insert and deletion. A failed capacity check rolls back metadata as well. Workspace listings never select the BLOB column.

Private image reads retain the same membership checks. Public delivery still requires an unguessable token for an eligible job. Database backups now contain image bytes, so a restore can recover editorial state and media together. There is no separate object-storage binding or subscription in the default configuration.

This is a small-team tradeoff. D1 serializes BLOBs as arrays and has a 2 MB row limit. The 1 MiB cap leaves row headroom, while the 100 MiB total leaves space beneath the 500 MB Free database limit. Images also consume database reads and Worker CPU. Verify representative images on the hosted Free plan. Capacity exhaustion is explicit; archival requires an operator until a member-facing archive tool exists.

Earlier R2 media are not automatically imported or deleted. Preserve that storage and migrate its images before switching an existing installation. The first hosted installation has no legacy uploads.

Sources: [D1 Free behavior](https://developers.cloudflare.com/d1/reference/faq/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [BLOB conversion](https://developers.cloudflare.com/d1/worker-api/#type-conversion).
