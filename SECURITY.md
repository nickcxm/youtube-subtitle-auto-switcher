# Security and privacy

This extension needs no API keys, account credentials or environment secrets. Do not add personal credentials, browser profiles or exported diagnostic logs to the repository.

- Original source code does not upload video frames or caption text.
- Optional models are fetched from the official PaddleOCR model host.
- Scripts and WASM runtime assets are bundled locally.
- Manifest V3 CSP remains enabled; JavaScript `unsafe-eval` is not allowed.
- The page-world bridge accepts metadata only; it cannot request arbitrary network URLs or change extension preferences.
- Local logs contain bounded operational fields and are exported only at the user's request.

Before submitting changes, run:

```bash
npm run typecheck
npm test
node scripts/check-secrets.mjs
```

The secret checker inspects tracked files for known credential formats and forbidden paths. It does not guarantee detection of every possible secret. Review staged diffs before publishing.

For a suspected vulnerability, use the repository's **Security → Report a vulnerability** feature if it is available. Avoid posting credentials, private viewing history or sensitive logs in a public issue. If private reporting is unavailable, open a minimal issue requesting a private contact without exploit details or sensitive data.
