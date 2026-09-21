# esaKITs / Classroom View Test Report

Date: 2026-09-22

## Historical v1.4 reference tests

The following results are historical results for the local v1.4 reference implementation. They do **not** establish general-public deployment safety or real classroom operation.

- `pytest -q`: 18 passed
- `node --check static/teacher.js`: PASS
- `node --check static/student.js`: PASS
- `python -m py_compile server.py`: PASS
- ZIP integrity: PASS

Historical automated coverage included the 45-seat map, layout limits, validation, Class/Session APIs, duplicate seats, seat correction, privacy contracts, CSV, WebSocket signaling/state, PNG/view modes, round tables, bilingual student UI, and tablet contracts.

## v1.5 cost-safe public edition

Status: **UNVERIFIED / 未検証**

No claim is made yet that the cost-safe public edition is complete, production-ready, generally deployed, or capable of 40–48 simultaneous real users.

### Cost Safety Test

| Check | Status |
|---|---|
| No author-billable application host | DESIGN REQUIREMENT — implementation unverified |
| No author-billable database | DESIGN REQUIREMENT — implementation unverified |
| No author-billable signaling service | DESIGN REQUIREMENT — implementation unverified |
| No author-billable TURN/SFU | DESIGN REQUIREMENT — implementation unverified |
| No author-billable API/storage | DESIGN REQUIREMENT — implementation unverified |
| Bot/session-flood cannot create author charges | UNVERIFIED |
| Long connections cannot create author charges | UNVERIFIED |
| Traffic spike cannot create author charges | UNVERIFIED |

### Functional/public-operation gate

| Check | Status |
|---|---|
| Static public frontend | UNVERIFIED |
| Real teacher + student browsers | UNVERIFIED |
| Multi-device WebRTC | UNVERIFIED |
| Signaling without billable backend | UNVERIFIED |
| University NAT/firewall/proxy | UNVERIFIED |
| TURN-free/zero-cost failure behavior | UNVERIFIED |
| 40–48 participant load | UNVERIFIED |
| Security/abuse review | UNVERIFIED |
| Public URL end-to-end operation | UNVERIFIED |

## Release wording rule

Until every applicable gate has direct execution evidence, do not use PASS, complete, verified, production-ready, or 48-user-ready for the cost-safe public edition.
