# CHANGELOG

## v1.5-cost-safe (development) - 2026-09-22

- Added zero-author-billing as a mandatory public-release requirement.
- Prohibited author-billable hosting, database, signaling, TURN/SFU, API and storage dependencies for the free public edition.
- Defined GitHub Pages/static frontend as the preferred public delivery model.
- Defined teacher-device local persistence and JSON backup as the target durable-data model.
- Added hostile-public-traffic assumptions and Cost Safety Test release gates.
- Marked signaling, NAT/STUN/TURN behavior, university-network compatibility, and 40–48-user operation as UNVERIFIED until directly tested.
- Retained v1.4 as the functional reference; no destructive replacement of main during the architecture migration.

## v1.4 - 2026-09-21

- Added esaKITs / Enhanced Smart AI Kits branding and copyright footer.
- Added teacher-desk class title and clock.
- Added manual front/rear classroom orientation.
- Changed join presentation to URL-first with copy and secondary QR.
- Added JSON backup/export-import support.
- Kept v1.4 Python/WebSocket architecture as the local/reference implementation.

## v1.3

- Added teacher support for approximately 11-inch landscape tablets.
- Added touch-oriented responsive controls.
- Added student tablet fallback/device metadata.

## v1.2

- Added Japanese/English student UI.

## v1.1

- Added 2×3 round-table layout with 18 seats.

## v1.0

- Added persistent Class/Session model, fixed class URL, 45-seat default classroom, layout editor, display modes, logs/CSV, PNG snapshot, and existing realtime classroom functions.
