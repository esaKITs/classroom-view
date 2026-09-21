# esaKITs / Classroom View Test Report

Date: 2026-09-21

## Automated

- `pytest -q`: **11 passed**
- `node --check static/teacher.js`: PASS
- `node --check static/student.js`: PASS
- `python -m py_compile server.py`: PASS

Covered by automated tests include: exact 45-seat default map; three unavailable positions; seats 01–45; 12×12 and 11+11 aisle limits; vertical/horizontal numbering; ID validation/normalization; Katakana validation; Class persistence API; fixed Class URL; Session start/end; duplicate seat acceptance; unavailable seat rejection; teacher seat correction; student-facing privacy; CSV; teacher/student WebSocket connection; share-state; heartbeat; raise hand/Yes; teacher message; teacher reconnect; static UI contracts for PNG, view modes and 180° student seat map.

## Important production limitation

Automated tests validate application logic and signaling contracts, not 45 simultaneous real browsers/video encoders. Production-scale media requires HTTPS/TURN and preferably an SFU.


## v1.1 丸テーブル型追加テスト
- pytest: 13 passed
- teacher.js: node --check PASS
- student.js: node --check PASS
- 2段×3列・6卓・18席の採番とseat_positionを自動テスト済み。


## v1.2 学生側日英併記
- pytest: 15 passed
- teacher.js / student.js: node --check PASS
- 学生側主要UI・動的メッセージの日英併記を静的テスト済み。

## v1.3 タブレット対応
- pytest: 18 passed
- teacher.js / student.js: node --check PASS
- 教師11インチ級横向きタブレット用レスポンシブCSS契約テスト PASS
- 学生タブレット自動判別・代替参加契約テスト PASS
- 教師側端末種別／外部共有待機表示契約テスト PASS
