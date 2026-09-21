# esaKITs / Classroom View Test Report

Date: 2026-09-22

## Automated

- `pytest -q`: **18 passed**
- `node --check static/teacher.js`: PASS
- `node --check static/student.js`: PASS
- `python -m py_compile server.py`: PASS
- ZIP integrity: PASS

Covered tests include the 45-seat default map, layout limits and numbering, validation, Class/Session persistence, duplicate seat acceptance, unavailable seat rejection, seat correction, student privacy, CSV output, WebSocket signaling, sharing state, heartbeat, raise hand/Yes, teacher messaging, reconnect behavior, bilingual student UI, round tables and tablet contracts.

## Production limitation

Automated tests validate application logic and signaling contracts, not 45 simultaneous real browsers/video encoders. Production-scale media requires HTTPS/TURN and preferably an SFU.
