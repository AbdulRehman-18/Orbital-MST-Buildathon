# Runbook — monitoring and alerting

Stack (compose profile `observability`): **Prometheus** scrapes the API's `/metrics` every 15 s, **Alertmanager** routes to Slack (all) and email (critical), **Grafana** shows the *Namma Seva — overview* dashboard (provisioned from `infra/monitoring/grafana`).

```bash
mkdir -p infra/secrets && cd infra/secrets
printf '%s' "$METRICS_TOKEN"  > metrics_token         # same value as the API's METRICS_TOKEN
printf '%s' "$SLACK_WEBHOOK"  > slack_webhook_url
printf '%s' "$SMTP_PASSWORD"  > smtp_password
cd ../.. && docker compose -f infra/compose/docker-compose.prod.yml --env-file infra/compose/prod.env --profile observability up -d
```
Edit `infra/monitoring/alertmanager.yml` (SMTP relay, on-call address). Grafana listens on `127.0.0.1:3000` — reach it through an SSH tunnel or an authenticated reverse proxy, never the open internet.

## The four signals (plan §18.3)
| Metric | Meaning | Warning | Critical |
|---|---|---|---|
| `indexer_lag_blocks` | chain head − last indexed block | > 20 for 5 m | > 200 for 10 m; or `indexer_last_update_age_seconds` > 120 s (stalled) |
| `relayer_balance` (MSTC) | gas for citizen actions | < 10 for 5 m | < 2 for 2 m |
| `tx_failures_total{kind}` | relayer jobs that failed for good | > 5 in 15 m | — |
| `rpc_latency_ms` (histogram), `rpc_up` | `eth_blockNumber` probe | p95 > 2 s for 10 m | RPC down for 2 m |

Plus `relayer_spent_today` (warning at 40 of the 50 MSTC default cap), `http_requests_total{method,route,status}` and `http_request_duration_ms` (5xx > 5 %, p95 > 1.5 s), `up{job="api"}`. Each alert links its runbook section.

## Endpoint
`GET /metrics` is served on the API's port only — **not** under `/api` — and Nginx returns 404 for it. It needs `Authorization: Bearer $METRICS_TOKEN`; in production it is disabled entirely when `METRICS_TOKEN` is unset. Labels use the matched route pattern, so cardinality stays bounded.

## Testing alerts
```bash
curl -s -H "authorization: Bearer $METRICS_TOKEN" http://api:3001/metrics | grep -E '^(indexer_lag|relayer_balance|tx_failures|rpc_)'
docker compose … stop indexer   # IndexerStalled fires in ~3–5 min; start it again to resolve
```
Run this drill once per environment and record it in `docs/pilot/rehearsal-log.md`.
