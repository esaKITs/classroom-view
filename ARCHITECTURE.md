# esaKITs / Classroom View Architecture

## v1.5 design objective

The public edition has one non-negotiable infrastructure rule:

> Third-party use, including abusive use, must not create usage charges for Tetsuya Esaki / esaKITs.

The v1.4 Python/WebSocket implementation remains the functional reference while the cost-safe transport is developed separately. It must not be treated as the architecture for a generally hosted esaKITs service.

## Target public topology

```text
GitHub Pages (static HTML/CSS/JS)
        |
        +-- Teacher browser
        |     - class/layout settings
        |     - local durable storage
        |     - CSV/PNG/JSON export
        |
        +-- Student browsers
              - join UI
              - screen capture
              - transient classroom state

Teacher <---- WebRTC media/data ----> Students
```

No author-owned always-on application server is part of the target topology.

## Transport gate

WebRTC does not by itself prove a zero-cost deployable architecture. Before implementation is promoted to the public edition, verify:

- signaling without an author-billable backend;
- ICE/STUN behavior;
- TURN requirement and failure behavior;
- NAT/firewall/proxy behavior on realistic university networks;
- teacher reception of up to 40–48 student screen streams;
- reconnect and session-end behavior;
- teacher-to-student presentation;
- hand / Yes-No / short-message data paths.

An author-paid TURN server, SFU, signaling service, database, API, or storage service is prohibited in the free public edition. If a paid relay is necessary for acceptable reliability, record the requirement as a design conflict; do not add it silently.

## Persistence

Durable class configuration should move to the teacher browser:

- IndexedDB preferred for structured persistent data;
- localStorage only for small preferences/active pointers;
- JSON export/import for backup and transfer.

Student IDs, names, seats, connection history, and screens must not be persistently stored by esaKITs infrastructure.

## Security/abuse model

Assume hostile public traffic. Review at minimum:

- session-ID guessing/enumeration;
- teacher impersonation;
- student impersonation;
- unauthorized class joining;
- message/session floods;
- malformed payloads and XSS;
- resource exhaustion;
- long-lived connections.

Security controls must not reintroduce an author-billable dependency.

## Classroom-scale release gate

Maximum target: one teacher plus 48 students.

A successful small demo is not evidence of 48-user support. CPU, GPU, memory, network bandwidth, encoder/decoder count, browser stability, ICE success, and recovery must be measured with real browser sessions before claiming 40–48 participant readiness.

## v1.4 reference behavior to preserve

- class/session concept and reusable layout;
- default 45-seat classroom and round-table layouts;
- classroom / compact-empty / participants-only views;
- student screen sharing and focused enlargement;
- hand raise, Yes/No, short messages;
- teacher screen sharing;
- reconnect/liveness indication;
- teacher seat correction and duplicate-seat warning;
- CSV, PNG and JSON backup;
- teacher desk/class title/clock and front/rear orientation;
- Japanese teacher UI and bilingual student UI.

If a feature cannot be preserved under the zero-author-cost architecture, mark it **要再設計** rather than deleting it.

## Privacy defaults

- No video recording.
- No automatic screenshots.
- No student-to-student roster/channel.
- No persistent student data on esaKITs infrastructure.
