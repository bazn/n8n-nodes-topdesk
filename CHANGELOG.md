# Changelog

## 0.1.0

- First version
- Node *TOPdesk* with the resources Incident, Change, Person, Operator, Operator Group, Branch and API Request
- Incidents: create (registered or unregistered caller), get by number or ID, list with filters and FIQL, update, add action, get actions, escalate, de-escalate, archive, unarchive, upload/list/download attachments, register and read time spent
- Changes: create (by type or template), get, list, update (JSON Patch), progress trail
- Node *TOPdesk Trigger*: new or changed incidents, filtered by category, operator group, processing status and line
- Credential *TOPdesk API* (username and application password)
- Rate-limited requests (HTTP 429) are retried
- Node and credential icons use the official TOPdesk logo
