<div align="center">

<img src="nodes/Topdesk/topdesk.svg" alt="TOPdesk logo" width="96" height="96">

# TOPdesk for n8n

**Automate TOPdesk with n8n:** incidents with actions, attachments, escalation and time registration, changes, persons, operators, operator groups and branches, plus a trigger for new and changed incidents.

[![npm version](https://img.shields.io/npm/v/@bazulu1/n8n-nodes-topdesk.svg)](https://www.npmjs.com/package/@bazulu1/n8n-nodes-topdesk)
[![npm downloads](https://img.shields.io/npm/dm/@bazulu1/n8n-nodes-topdesk.svg)](https://www.npmjs.com/package/@bazulu1/n8n-nodes-topdesk)
[![CI](https://github.com/bazn/n8n-nodes-topdesk/actions/workflows/ci.yml/badge.svg)](https://github.com/bazn/n8n-nodes-topdesk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![n8n community node](https://img.shields.io/badge/n8n-community%20node-EA4B71.svg)](https://docs.n8n.io/integrations/community-nodes/)

</div>

> [!NOTE]
> **This is not an official TOPdesk project.** It is an independent community node, not affiliated with, endorsed by or supported by TOPdesk. For problems with this node, please [open an issue](https://github.com/bazn/n8n-nodes-topdesk/issues) here, not with TOPdesk support.

---

## Highlights

- **Full incident handling:** create incidents for registered persons or unregistered callers, update them, reply with actions (visible or internal), escalate, archive, upload and download attachments, register time spent.
- **Incidents by number or ID:** every incident field accepts the incident number (`I 2610 123`), the UUID, or a pick from a searchable list.
- **Filters without FIQL:** Get Many filters by caller, operator, operator group, category, processing status, line, closed/completed and dates. A free *Query (FIQL)* field reaches every other field.
- **A trigger for the service desk:** new or changed incidents, filtered by operator group, category, processing status or line, e.g. to notify a Teams channel or start an AI triage.
- **Comfortable to use:** categories, subcategories, call types, entry types, impacts, urgencies, priorities, durations, processing statuses, closure codes, operator groups, branches and departments are lists loaded live from your TOPdesk.
- **Changes, persons and the directory:** create and update changes, read their progress trail; manage persons and branches; look up operators and operator groups.
- **AI-agent ready:** every operation can be used as a tool by n8n AI agents.
- **Escape hatch:** the *API Request* resource calls any endpoint below `/tas/api` (assets, knowledge items, reservations …) with the node's credential.

## Contents

- [Installation](#installation)
- [Credentials](#credentials)
- [TOPdesk node](#topdesk-node)
- [TOPdesk Trigger](#topdesk-trigger)
- [Good to know](#good-to-know)
- [Development](#development)
- [Releasing](#releasing)
- [Author](#author)
- [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [License](#license)

## Installation

**Self-hosted n8n (also in Docker)**

1. Open **Settings → Community Nodes → Install**.
2. Enter `@bazulu1/n8n-nodes-topdesk`, confirm the notice and install.
3. Search for **TOPdesk** in the node panel.

In Docker the package lives in the persistent `~/.n8n/nodes` volume and survives restarts. Updates are offered on the same settings page.

<details>
<summary>Install without the UI (e.g. for queue-mode workers)</summary>

```bash
docker exec -it <n8n-container> sh -c "mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm install @bazulu1/n8n-nodes-topdesk"
docker restart <n8n-container>
```

</details>

> n8n Cloud only allows community nodes that n8n has verified. This package is currently meant for self-hosted n8n.

## Credentials

| Credential | Fields |
|---|---|
| **TOPdesk API** | **TOPdesk URL** (e.g. `https://yourcompany.topdesk.net`), **username** and **application password** |

- Create the **application password** in TOPdesk under *My Settings → Application passwords*. The normal login password does not work with the API.
- The operator needs the permission *REST API* and the read/write rights for the modules the workflows use (incident management, change management, supporting files). The node acts with exactly these rights.
- The credential test calls `/tas/api/operators/current`, so use an **operator** account.
- On-premises installations work the same way; enter the address you open TOPdesk with. `/tas` or `/tas/api` at the end is removed automatically.

## TOPdesk node

### Service desk

| Resource | Operations |
|---|---|
| **Incident** | Create, Get, Get Many, Update, Add Action, Get Actions, Escalate, De-Escalate, Archive, Unarchive, Upload Attachment, Get Attachments, Download Attachment, Register Time Spent, Get Time Spent |
| **Change** | Create, Get, Get Many, Update, Get Progress Trail |

- **Caller:** choose *Registered Person* (searchable list of persons) or *Unregistered Caller* with name, branch and optional email and phone numbers.
- **Add Action** appends an entry to the action history. *Invisible for Caller* makes it an internal note; otherwise the caller sees it in the self-service portal (and gets an email if TOPdesk is set up to send one).
- **Request** on *Update* adds a new entry to the request history; it does not replace the original request.
- **Partial incidents:** set *Status (Line)* to *Partial* and *Main Incident* to the number or ID of the main incident.
- **Attachments:** *Upload Attachment* sends a binary field of the input item (e.g. an email attachment). *Download Attachment* returns the file as binary data; take the attachment ID from *Get Attachments*.
- **Time spent** is registered in minutes; an empty date means now.
- **Change → Update** uses JSON Patch. *Brief Description* and *External Number* are offered as fields; anything else goes into *Patch Operations (JSON)*.
- References in change fields (category, impact, priority …) take the name as shown in TOPdesk or the ID.

### Directory

| Resource | Operations |
|---|---|
| **Person** | Create, Get, Get Many, Update, Archive, Unarchive |
| **Operator** | Get, Get Current, Get Many |
| **Operator Group** | Get, Get Many, Get Operators |
| **Branch** | Create, Get, Get Many, Update |

- **Get Many** for persons, operators and operator groups returns active records. Turn on the *Archived* filter for archived ones.

### Other

| Resource | Operations |
|---|---|
| **API Request** | Send any request to `…/tas/api/…` with the node's credential (JSON or JSON Patch body) |

## TOPdesk Trigger

Polls TOPdesk and starts the workflow for each new or changed incident, at the interval set on the trigger (*Poll Times*).

| Event | Filters |
|---|---|
| **Incident Created** | category, operator group, processing status, line, without closed incidents, FIQL query |
| **Incident Created or Updated** | same |

*Created or Updated* fires for every change that moves the incident's modification date, including new actions and status changes.

### How it works

- The trigger keeps a **position** (the newest creation or modification time it has seen) in the workflow's static data and only emits incidents beyond it.
- On **first activation** it starts at the newest existing incident instead of emitting the whole history.
- A **manual test run** never moves the position. It shows what the active trigger has not delivered yet, or else the newest incident as a sample.
- TOPdesk compares times in whole seconds, so the trigger also remembers which incidents it already emitted in the last second and never emits them twice.
- Up to 1000 incidents are emitted per poll; the rest follows with the next poll.

## Good to know

- **Incident number or ID:** the incident field accepts both; a UUID is looked up by ID, anything else by number.
- **Dates** are sent to TOPdesk in UTC (`2026-03-01T10:15:30.000+0000`); times with an offset are converted, so the result does not depend on the workflow's time zone.
- **Additional Fields (JSON):** create and update forms accept further attributes as in the TOPdesk API reference, e.g. `{"optionalFields1": {"text1": "abc"}}`. They override the fields above.
- **FIQL:** in *Query (FIQL)*, `;` means AND, `,` means OR, `*` is a wildcard: `briefDescription==*vpn*,request==*vpn*`.
- **Rate limits:** requests answered with HTTP 429 are retried up to three times, following `Retry-After`.

## Development

Requires Node.js 24 or newer.

```bash
npm install
npm run dev        # starts n8n with the node loaded and rebuilds on changes
npm run lint       # n8n community node rules
npm test           # build + unit tests (no TOPdesk account needed)
```

The code follows the structure of the n8n community node starter: `nodes/Topdesk/descriptions` holds the UI definitions, `nodes/Topdesk/actions` the operations per resource, `GenericFunctions.ts` the request, paging and FIQL helpers, and `methods.ts` the dynamic lists.

## Releasing

1. Update [CHANGELOG.md](CHANGELOG.md).
2. `npm version <patch|minor|major>` and `git push --follow-tags`.
3. The *Publish* workflow stages the version on npm and creates a GitHub release; approve the staged version on npmjs.com.

## Author

Built and maintained by **Dominik Vogt** ([LinkedIn](https://www.linkedin.com/in/dominik-vogt-2b070364/), [GitHub](https://github.com/bazn)).

For bugs and feature requests, please [open an issue](https://github.com/bazn/n8n-nodes-topdesk/issues).

## License

[MIT](LICENSE.md)

TOPdesk and the TOPdesk logo are trademarks of TOPdesk. They are used only to identify the service this node connects to. This project is not an official TOPdesk product and is not affiliated with or endorsed by TOPdesk.
