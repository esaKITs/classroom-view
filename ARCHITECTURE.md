# esaKITs / Classroom View Architecture

## Roles

- **Teacher**: fixed entry URL, no account; creates or recovers one active class session.
- **Student**: joins only through that session's temporary URL/QR; cannot see other students.
- **Server**: owns session, seat map, recovery code, identities, WebSocket signaling, and transient classroom state.

## Seat numbering

For `rows=8`, `cols=6`, numbering is column-major from the teacher side:

```text
 8  16  24  32  40  48
 7  15  23  31  39  47
 6  14  22  30  38  46
 5  13  21  29  37  45
 4  12  20  28  36  44
 3  11  19  27  35  43
 2  10  18  26  34  42
 1   9  17  25  33  41
       教卓側
```

A disabled physical seat is left blank and its number remains missing; following seats are not renumbered. Once any student has joined, row/column counts are locked for that session so existing seat numbers do not move.

## Media

### Current v0.1 transport

- Browser screen capture: `getDisplayMedia()`
- Student → teacher: WebRTC media track
- Teacher → student presentation: WebRTC media track
- Signaling, hand raise, Yes/No, short messages, share-state and 2-second liveness heartbeat: WebSocket
- Thumbnail quality request: approximately 320×180 at 2–3 fps
- Focus quality request: approximately 1280×720 at up to 12 fps

The browser may not honor all screen-capture constraints exactly; `applyConstraints()` is treated as a best-effort request.

### SFU boundary

The UI and session signaling are kept separate from media policy, but **v0.1 uses browser-to-browser peer connections for runnable functional validation**. Before a 40–48-seat production trial, the media path should be replaced by an SFU so each browser publishes once and the teacher subscribes to many tracks without building a full mesh.

The SFU layer must preserve these application messages:

- participant identity / seat number
- thumbnail vs focus quality intent
- teacher presentation active/inactive
- reconnection into the same classroom session

## Persistence and recovery

- Active session metadata is written to `sessions.json`.
- Closing the teacher browser does not end the session.
- Same browser restores from local storage.
- Another device restores with the one-session recovery code.
- Server restart resets live connection flags while preserving active session metadata.

## Privacy defaults

- No video recording.
- No automatic screenshots.
- Student UI contains no roster and no student-to-student channel.
- The student-facing session API exposes no other student identity, roster, participation state, or occupied-seat list.
- Stored metadata should receive a retention policy before institutional production deployment.
