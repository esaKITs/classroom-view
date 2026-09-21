# Cost-safe transport prototype

This directory is an executable first step toward the v1.5 public architecture.

## What it proves

The prototype can be served as static files and creates a browser-to-browser WebRTC connection with:

- no Python application server;
- no WebSocket signaling server;
- no database;
- no TURN server;
- no SFU;
- no analytics;
- no external API;
- `RTCPeerConnection({iceServers:[]})`.

Signaling is deliberately manual copy/paste. That avoids hiding a billable signaling dependency and lets us test the hard part first: whether direct host-candidate WebRTC works in the intended network environments.

## Test

Serve the repository over HTTPS (GitHub Pages is suitable for this prototype), open `cost-safe/prototype.html` in two browsers/devices, choose Teacher and Student, and exchange the generated offer/answer packets.

The student must start screen sharing before generating/answering as appropriate.

Record:
- same LAN success/failure;
- campus Wi-Fi success/failure;
- wired campus network success/failure;
- different networks success/failure;
- browser/device;
- ICE/peer connection state.

## Expected limitation

With no STUN/TURN, direct connection can fail across NAT/firewall boundaries. That failure is important evidence. Do not add a paid relay to make the test pass.

## Status

Static zero-backend prototype: implemented.
Real network validation: UNVERIFIED.
40–48 participant validation: UNVERIFIED.


<!-- Pages deployment retry marker: environment branch permission enabled -->
