# esaKITs / Classroom View

Browser-based classroom screen monitoring for BYOD environments. Classroom View restores a useful CALL-classroom function—seeing students’ shared computer screens—without requiring student-side software installation.

**Author / Copyright:** © 2026 Tetsuya Esaki / esaKITs — Enhanced Smart AI Kits

## Main features
- Real-time student screen monitoring in a browser
- Classroom seat-layout view, editable and reusable per class
- Student participation by class URL; no student-side application installation
- Individual screen enlargement
- Raise hand, Yes/No, and short messages
- Teacher-to-student messages and teacher screen sharing
- Session connection history and CSV export
- Manual PNG snapshot of the classroom view
- Teacher support for desktop and approximately 11-inch landscape tablets
- Bilingual Japanese/English student interface
- Front/rear classroom orientation switching
- Backup/export and restore/import of persistent data

## Requirements
Classroom View requires an online environment. Both teacher and students need an Internet connection. Browser/device limitations may prevent whole-device screen sharing on some tablets, including iPad; such devices can still participate in supported fallback functions.

## Start
Install Python 3 and the dependencies:

```
pip install -r requirements.txt
python server.py
```

Then open the teacher page in a browser. For actual deployment, use HTTPS and an appropriate WebRTC/TURN/SFU configuration.

## Persistent data
Persistent data is stored by default in `~/.esakits/classroom-view/state.json`. Set `CLASSROOM_VIEW_DATA_DIR` to choose another location. Existing legacy `state.json` data beside the application is migrated automatically on first run.

## License
Free for non-commercial educational, research, and personal use. Commercial use is prohibited without prior written permission from the copyright holder. See `LICENSE`.

© 2026 Tetsuya Esaki / esaKITs — Enhanced Smart AI Kits
