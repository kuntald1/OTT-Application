import hashlib
import hmac
import time

import httpx

from app.config import settings

MUX_API_BASE = "https://api.mux.com/video/v1"


class MuxServiceError(Exception):
    """Raised when the Mux API call fails, or credentials aren't
    configured. Callers should surface this as a clear error to the
    person creating the live stream — unlike the AI features, there's
    no reasonable "degrade gracefully" here: without Mux, there's no
    live stream to create at all.
    """


def _auth():
    if not settings.MUX_TOKEN_ID or not settings.MUX_TOKEN_SECRET:
        raise MuxServiceError("MUX_TOKEN_ID / MUX_TOKEN_SECRET are not configured.")
    return (settings.MUX_TOKEN_ID, settings.MUX_TOKEN_SECRET)


def create_mux_live_stream(title: str) -> dict:
    """Creates a live stream on Mux — returns the raw Mux API response
    dict, which includes `id` (Mux's live stream id), `stream_key`
    (RTMP secret), and `playback_ids` (use playback_ids[0]['id'] for
    the public HLS playback id). playback_policy is "public" —
    deliberately not "signed": theomy's own access control already
    gates who ever RECEIVES the playback URL from our API (same
    pattern as Bunny VOD's embed_url), so a second signing layer on
    Mux's side would be redundant complexity, not extra real security.
    """
    try:
        response = httpx.post(
            f"{MUX_API_BASE}/live-streams",
            auth=_auth(),
            json={
                "playback_policy": ["public"],
                "new_asset_settings": {"playback_policies": ["public"]},
                "reconnect_window": 60,
                "passthrough": title[:200],
            },
            timeout=15.0,
        )
        if response.status_code >= 400:
            # Surface Mux's actual error body (has the real "which field
            # was invalid" detail) instead of just the generic HTTP
            # status line — that's the only way to actually fix a 400
            # instead of guessing at the request shape.
            raise MuxServiceError(f"Mux API {response.status_code}: {response.text}")
        return response.json()["data"]
    except MuxServiceError:
        raise
    except Exception as e:
        raise MuxServiceError(f"Mux create-live-stream request failed: {e}") from e


def delete_mux_live_stream(mux_live_stream_id: str) -> None:
    """Best-effort — called when an admin/creator ends or deletes a
    live stream on theomy's side, to also clean it up on Mux so it
    stops billing/existing there. Swallows errors (the theomy-side
    LiveStream row is what actually matters for the site; a leftover
    Mux resource is a minor cleanup issue, not a broken feature).
    """
    try:
        httpx.delete(f"{MUX_API_BASE}/live-streams/{mux_live_stream_id}", auth=_auth(), timeout=15.0)
    except Exception:
        pass


def verify_mux_webhook_signature(raw_body: bytes, mux_signature_header: str) -> bool:
    """Mux signs webhook payloads as `t=<timestamp>,v1=<hex_hmac>` in
    the Mux-Signature header. Verifies the HMAC-SHA256 over
    "{timestamp}.{raw_body}" using MUX_WEBHOOK_SECRET, so a request
    claiming to be a live-stream-went-active event can't be forged by
    anyone who doesn't know that secret.
    """
    if not settings.MUX_WEBHOOK_SECRET or not mux_signature_header:
        return False
    try:
        parts = dict(p.split("=", 1) for p in mux_signature_header.split(","))
        timestamp = parts["t"]
        expected_sig = parts["v1"]
    except (KeyError, ValueError):
        return False

    signed_payload = f"{timestamp}.{raw_body.decode('utf-8')}".encode("utf-8")
    computed_sig = hmac.new(
        settings.MUX_WEBHOOK_SECRET.encode("utf-8"), signed_payload, hashlib.sha256
    ).hexdigest()

    # Reject stale requests (replay protection) — 5 minute tolerance.
    try:
        if abs(time.time() - int(timestamp)) > 300:
            return False
    except ValueError:
        return False

    return hmac.compare_digest(computed_sig, expected_sig)
