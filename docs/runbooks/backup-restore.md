# Runbook — backups and restore

**What is backed up.** Postgres holds two kinds of data: (1) the *read model* — projections of chain events, rebuildable from the chain at any time; and (2) *off-chain-only* data that the chain cannot recreate: users and consent records, sessions, pinned metadata bodies, proof-photo metadata and checks, relayer bookkeeping, audit logs, anomalies. Backups exist mainly for (2); (1) is a faster restore than a full re-index.

IPFS content is pinned to Pinata **and** a backup pin service (`IPFS_BACKUP_PIN_URL`), separate from Postgres.

## Nightly backup
The compose `backup` service runs `infra/scripts/backup-postgres.sh --loop` at `BACKUP_HOUR_UTC` (20:00 UTC ≈ 01:30 IST): `pg_dump --format=custom`, a SHA-256 file, 14 days of local retention, and — if `BACKUP_S3_URI` is set — upload to object storage. Configure the bucket with versioning, server-side encryption and a **cross-region replica**; give the backup role write-only access.

Manual backup any time:
```bash
docker compose -f infra/compose/docker-compose.prod.yml exec backup /bin/sh /scripts/backup-postgres.sh
```

## Weekly restore drill (automated)
`.github/workflows/restore-drill.yml` (Sundays) pulls the newest object from `BACKUP_S3_URI`, restores it into a throw-away Postgres 16 container and checks migrations, projects and indexer cursor (`infra/scripts/restore-test.sh`). A red drill is an **incident** — the backup is not proven until restored. Run it by hand the same way:
```bash
BACKUP_DIR=./backups sh infra/scripts/restore-test.sh
# {"restored":"nammaseva-20261004T200000Z.dump","projects":48,"chainEvents":1312,"migrations":3,"indexedToBlock":91234}
```

## Disaster restore
1. Stop `api` and `indexer` (`docker compose … stop api indexer`), keep `postgres` up.
2. Restore into a **new** database (never over the damaged one until you have checked it):
   ```bash
   docker compose … exec -T postgres createdb -U ns_user nammaseva_restore
   docker compose … exec -T postgres pg_restore --no-owner -U ns_user -d nammaseva_restore < backups/nammaseva-<stamp>.dump
   ```
3. Swap: point `DATABASE_URL` at the restored database (or rename databases), then `docker compose … up -d migrate api indexer`. The migration step applies anything newer than the backup.
4. The indexer resumes from its stored cursor and re-reads everything since; because indexing is idempotent and reorg-safe, gaps fill themselves. `indexer_lag_blocks` should fall to ~0.
5. Reconcile: `pnpm --filter @namma-seva/api indexer:checksum` prints the read-model checksum. To prove the restored projection matches the chain, run `indexer:rebuild` against a scratch database and compare its checksum with the restored one.

## Last resort: rebuild from chain
If every backup is lost, the read model comes back with `pnpm --filter @namma-seva/api indexer:rebuild` (replays from the deployment block; hours, not days, at pilot scale). **Lost for good:** consent records (citizens re-consent at next login), sessions (everyone signs in again), unpinned metadata bodies (recoverable from IPFS by CID via the chain events), audit logs older than the last backup. Record the loss window in the incident report.

## Targets
RPO ≤ 24 h (nightly; tighten with WAL archiving before mainnet if the pilot data warrants), RTO ≤ 4 h.
