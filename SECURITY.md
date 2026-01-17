# Security

## Principles
- No inline scripts
- No eval/new Function
- No hardcoded secrets in frontend

## WhatsApp Bridge
- Requires Bearer token for all API endpoints
- Verify webhook token for inbound WhatsApp verification
- Store WhatsApp API access token only as Worker secret (never in the browser)

## Household privacy
- Allowed senders should be restricted in the Worker (allowlist)
- Keep all data private to the household
