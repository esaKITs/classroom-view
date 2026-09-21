# esaKITs / Classroom View

Browser-based classroom screen monitoring for BYOD environments. Classroom View restores a useful CALL-classroom function—seeing students’ shared computer screens—without requiring student-side software installation.

**Author / Copyright:** © 2026 Tetsuya Esaki / esaKITs — Enhanced Smart AI Kits

## Main features

- Student screen sharing and real-time teacher overview
- Classroom seat-layout view, editable and reusable per class
- Browser participation from a fixed class URL; no student-side installation
- Individual screen enlargement, raise hand, Yes/No, and short messages
- Teacher screen sharing
- Session connection logs and CSV export
- Whole-class PNG snapshot
- Teacher UI for PC and approximately 11-inch landscape tablets
- Front-of-room / rear-of-room 180° viewing mode
- Persistent data stored separately from application files, with JSON backup/restore
- Japanese/English student interface

## Important

Classroom View requires an online environment. Both teacher and students need an Internet connection. Browser/device limitations may prevent whole-device screen sharing on some tablets, including iPad; such devices can still participate in supported fallback functions.

This project is not a full device-management suite and does not guarantee prevention of cheating in online examinations.

## Run locally

Python 3.10+ is recommended.

```bash
pip install -r requirements.txt
python server.py
```

Open `http://localhost:8080/` in the teacher browser. For use across devices, deploy behind HTTPS. Production-scale use with many simultaneous WebRTC streams may require TURN/SFU infrastructure.

Persistent data is stored by default in `~/.esakits/classroom-view/state.json`. Set `CLASSROOM_VIEW_DATA_DIR` to choose another location. Existing legacy `state.json` data beside the application is migrated automatically on first run.

## License

Free for non-commercial personal, educational, and research use. Commercial use is prohibited without prior written permission. See [LICENSE](LICENSE).
