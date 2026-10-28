# Contributing

Issues and pull requests are welcome.

## Reporting a problem

Please include:

- the n8n version and the version of this package;
- whether you use TOPdesk SaaS or on-premises, and its version;
- the resource and operation (or trigger event) you used;
- the error message, with any IDs, tokens and personal data removed.

## Making changes

```bash
npm ci
npm run lint
npm test
```

- Keep the n8n community node lint rules green (`npm run lint`).
- Add unit tests in `test/unit/` for logic that does not need a TOPdesk account.
- If you change how the node talks to the TOPdesk API, test it against a TOPdesk test or acceptance environment, never against production data.
- Endpoints, fields and field names follow the [TOPdesk API reference](https://developers.topdesk.com). Document verified API behaviour as a short comment next to the code that relies on it.
- Add an entry to `CHANGELOG.md`.
