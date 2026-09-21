# Classroom View v1.4 deployment preparation

The application remains a single Python/aiohttp process with WebSocket signaling
and browser-to-browser WebRTC media. The Docker image includes the unchanged
teacher/student HTML, CSS, and JavaScript.

## Public deployment gate

This configuration prepares the runtime; it does **not** certify the current
application as safe for a shared, anonymous public service. Teacher ownership
and separation of classroom/backup data need to be addressed before enabling
public access. Runtime configuration alone does not provide that isolation.

## Railway configuration

- Source: `esaKITs/classroom-view`, branch `main`.
- Build: repository `Dockerfile`; start: `python server.py`.
- One service instance, one Python process. In-memory signaling is not shared
  across replicas.
- Attach a persistent volume at `/data` **before the first deployment**.
- `CLASSROOM_VIEW_DATA_DIR=/data/classroom-view` is set in the image.
- The `/data` volume is required; creating this directory without a volume
  does not make data persistent.
- Disable Serverless/sleep for classroom operation.
- Generate an HTTPS Railway domain. The server uses `RAILWAY_PUBLIC_DOMAIN`
  for generated participation URLs. An explicitly configured `PUBLIC_BASE_URL`
  overrides it, for example when using a custom HTTPS domain.
- The existing `PORT` setting and `0.0.0.0` binding are retained.
- Client WebSocket URLs already use `wss:` on HTTPS pages.
- `A10_ICE_SERVERS` accepts the existing JSON ICE-server configuration. Any TURN
  credentials included here are sent to clients by the application; use temporary,
  restricted credentials rather than account or administration credentials.

## Validation before release

1. Resolve teacher ownership/data isolation and the public deployment gate above.
2. Confirm the hosting account and approved budget; do not enable paid resources
   without the owner's approval.
3. Test teacher and student sessions through the generated HTTPS URL, including
   WSS events, media where browser permissions allow, exports, and reconnection.
4. Create a dummy class, restart the deployed service, and verify the class remains.
   Local restart tests alone do not establish hosted-volume persistence.
5. Confirm an unauthenticated new browser session can reach the intended entry page
   without gaining access to another teacher's private classroom data.

The production URL has not been issued at the time these files were prepared.
No paid hosting resource has been created by this configuration commit.
