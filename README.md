# esaKITs / Classroom View

Browser-based classroom screen monitoring for BYOD environments. Classroom View restores a useful CALL-classroom function—seeing students’ shared computer screens—without requiring student-side software installation.

© 2026 Tetsuya Esaki / esaKITs — Enhanced Smart AI Kits

## Main features

- Student screen sharing and real-time teacher overview
- Classroom seat-layout view, editable and reusable per class
- Browser participation; no student-side installation
- Individual screen enlargement, raise hand, Yes/No, and short messages
- Teacher screen sharing
- Session connection logs and CSV export
- Whole-class PNG snapshot
- Teacher UI for PC and approximately 11-inch landscape tablets
- Front-of-room / rear-of-room 180° viewing mode
- JSON backup/restore
- Japanese/English student interface

## Public-release rule: zero author billing

The public esaKITs edition must not use infrastructure where third-party traffic can create usage charges for Tetsuya Esaki / esaKITs. This includes ordinary use, bots, abusive session creation, long connections, and traffic spikes.

A service with a hard free cap is acceptable only when exceeding that cap stops or limits service without charging the author. A nominal “free tier” that automatically becomes billable is not acceptable.

The current v1.4 Python/WebSocket architecture is retained as the verified functional baseline only. It is **not approved for general hosted deployment**. Do not deploy it to Railway, Render, a VPS, or another author-billed service as the public esaKITs service.

The cost-safe public architecture is being developed on a separate branch. Until its signaling/NAT traversal and classroom-scale behavior are verified, public-service completion is **UNVERIFIED**.

## Required public architecture

- Static public frontend, preferably GitHub Pages.
- No always-on author-paid Python server.
- No author-paid database, signaling server, TURN server, SFU, API, or storage.
- Teacher/student browser use without software installation or server contracts.
- Class settings and durable classroom data stored on the teacher device where practical (IndexedDB/localStorage plus JSON backup).
- Student identities/screens are not persistently stored by esaKITs.
- WebRTC may be used for media, but signaling, STUN/TURN behavior, university-network compatibility, and 40–48 participant load must be demonstrated before production claims are made.
- If reliable use requires a paid TURN/SFU service, stop and report the conflict instead of silently adding billable infrastructure.

## v1.4 local/reference server

Python 3.10+:

```bash
pip install -r requirements.txt
python server.py
```

Open `http://localhost:8080/`. This mode is for local/reference validation. Persistent data is stored by default in `~/.esakits/classroom-view/state.json`.

## Release gate

Do not describe the cost-safe edition as “complete”, “production-ready”, “48-user ready”, or generally deployed until all of these have direct evidence:

1. functional tests
2. real-browser multi-device tests
3. university-network/NAT tests
4. classroom-scale load tests
5. security/abuse review
6. Cost Safety Test

Unperformed checks must be marked **UNVERIFIED / 未検証**.

## License

Free for non-commercial personal, educational, and research use. Commercial use is prohibited without prior written permission. See [LICENSE](LICENSE).
