#!/usr/bin/env python3
"""Local-only HTTP game server and Nikki Streams sensor bridge."""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed

ROOT = Path(__file__).resolve().parent
HTTP_HOST, HTTP_PORT = "127.0.0.1", 8000
BRIDGE_HOST, BRIDGE_PORT = "127.0.0.1", 8765
PHONE_ADDRESS = os.getenv("NIKKI_PHONE_ADDRESS", "").strip()
SESSION_ID = os.getenv("NIKKI_SESSION_ID", "").strip()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("dont-move")
clients: set[ServerConnection] = set()
loop: asyncio.AbstractEventLoop | None = None
phone_status: dict[str, Any] = {"bridge": "starting", "phone": "disconnected", "message": "Starting local sensor bridge."}


def load_dotenv() -> None:
    """Load simple KEY=value entries from the ignored project .env file."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def finite_vector(value: Any) -> list[float] | None:
    if not isinstance(value, (list, tuple)) or len(value) < 3:
        return None
    try:
        result = [float(value[i]) for i in range(3)]
    except (TypeError, ValueError, OverflowError):
        return None
    return result if all(math.isfinite(axis) and abs(axis) < 1_000_000 for axis in result) else None


def find_vector(payload: Any, *names: str) -> list[float] | None:
    if not isinstance(payload, dict):
        return None
    normalized = {str(key).lower().replace("_", "").replace(" ", ""): value for key, value in payload.items()}
    for name in names:
        value = normalized.get(name.lower().replace("_", "").replace(" ", ""))
        vector = finite_vector(value)
        if vector:
            return vector
    return None


def sensor_packet(payload: Any) -> dict[str, Any] | None:
    # SDK CallbackPayload.data is the decoded server message; allow one documented-style nested data layer.
    source = payload
    for _ in range(2):
        if not isinstance(source, dict):
            break
        if any(key in source for key in ("Accel", "Gyro", "LinAccel", "Accelerometer", "LinearAcceleration")):
            break
        nested = source.get("data")
        if isinstance(nested, dict):
            source = nested
        else:
            break
    accel = find_vector(source, "Accel", "Accelerometer")
    gyro = find_vector(source, "Gyro", "Gyroscope")
    linear = find_vector(source, "LinAccel", "LinearAcceleration", "linearAcceleration")
    if not any((accel, gyro, linear)):
        return None
    return {"type": "sensor", "timestamp": int(asyncio.get_running_loop().time() * 1000),
            "accel": accel, "gyro": gyro, "linearAcceleration": linear}


async def broadcast(message: dict[str, Any]) -> None:
    if not clients:
        return
    encoded = json.dumps(message, separators=(",", ":"), allow_nan=False)
    results = await asyncio.gather(*(client.send(encoded) for client in tuple(clients)), return_exceptions=True)
    for client, result in zip(tuple(clients), results):
        if isinstance(result, Exception):
            clients.discard(client)


def safe_error(exc: BaseException) -> str:
    """Prevent a connection exception from echoing the private SDK session ID."""
    message = f"{type(exc).__name__}: {exc}"
    return message.replace(SESSION_ID, "[redacted session ID]") if SESSION_ID else message


def sdk_callback(event: Any) -> None:
    """SDK callback runs on the SDK event loop; convert only validated sensor vectors."""
    global phone_status
    event_type = getattr(event, "type", None)
    data = getattr(event, "data", None)
    error = getattr(event, "error", None)
    if isinstance(event, dict):
        event_type, data, error = event.get("type"), event.get("data"), event.get("error")
    if event_type == "statusChange":
        connected = data == "connected"
        phone_status = {"bridge": "ready", "phone": "connected" if connected else "disconnected",
                        "message": "Phone sensors connected" if connected else "Waiting for phone sensors"}
        if error:
            phone_status["error"] = safe_error(error)
            LOG.warning("Nikki Streams status: %s", error)
        if loop:
            asyncio.run_coroutine_threadsafe(broadcast({"type": "status", **phone_status}), loop)
    elif event_type == "data":
        packet = sensor_packet(data)
        if packet and loop:
            asyncio.run_coroutine_threadsafe(broadcast(packet), loop)


async def browser_socket(websocket: ServerConnection) -> None:
    clients.add(websocket)
    try:
        await websocket.send(json.dumps({"type": "status", **phone_status}))
        async for raw in websocket:
            try:
                message = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue
            if isinstance(message, dict) and message.get("type") == "hello":
                await websocket.send(json.dumps({"type": "status", **phone_status}))
    except ConnectionClosed:
        pass
    finally:
        clients.discard(websocket)


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args: Any) -> None:
        LOG.info("HTTP %s", fmt % args)


def start_http_server() -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((HTTP_HOST, HTTP_PORT), QuietHandler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, name="local-game-http", daemon=True).start()
    return server


async def connect_phone() -> None:
    global phone_status
    if not SESSION_ID:
        phone_status = {"bridge": "error", "phone": "disconnected",
                        "message": "Nikki Streams session ID is not configured.",
                        "error": "Copy .env.example to .env and add your actual NIKKI_SESSION_ID. The project will not invent or expose a session ID."}
        LOG.error("No NIKKI_SESSION_ID configured; add your private ID to .env.")
        await broadcast({"type": "status", **phone_status})
        return
    if not PHONE_ADDRESS:
        phone_status = {"bridge": "error", "phone": "disconnected", "message": "Phone address is missing.",
                        "error": "Set NIKKI_PHONE_ADDRESS to the phone's current local address and port."}
        await broadcast({"type": "status", **phone_status})
        return
    try:
        from nikki_streams import SDK
        SDK.initialize(SESSION_ID)
        device = SDK.create_device(PHONE_ADDRESS, sdk_callback)
        phone_status = {"bridge": "ready", "phone": "connecting", "message": "Connecting to Nikki Streams…"}
        await broadcast({"type": "status", **phone_status})
        LOG.info("Connecting through Nikki Streams SDK at %s", PHONE_ADDRESS)
        await asyncio.wait_for(device.connect(), timeout=12)
        # The SDK receive task lives in the background. Keep this coroutine alive until it disconnects.
        while device.is_connected:
            await asyncio.sleep(.5)
        phone_status = {"bridge": "ready", "phone": "disconnected", "message": "Nikki Streams disconnected."}
        await broadcast({"type": "status", **phone_status})
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        phone_status = {"bridge": "error", "phone": "disconnected", "message": "Could not connect to Nikki Streams.",
                        "error": safe_error(exc)}
        LOG.exception("Nikki Streams connection failed")
        await broadcast({"type": "status", **phone_status})


async def main() -> None:
    global loop
    loop = asyncio.get_running_loop()
    http_server = start_http_server()
    LOG.info("Game page: http://%s:%d", HTTP_HOST, HTTP_PORT)
    LOG.info("Local browser bridge: ws://%s:%d", BRIDGE_HOST, BRIDGE_PORT)
    LOG.info("Press Ctrl+C to stop both servers.")
    phone_task = asyncio.create_task(connect_phone())
    try:
        async with serve(browser_socket, BRIDGE_HOST, BRIDGE_PORT, max_size=64 * 1024,
                         ping_interval=20, ping_timeout=20):
            await asyncio.Future()
    finally:
        phone_task.cancel()
        await asyncio.gather(phone_task, return_exceptions=True)
        http_server.shutdown()


if __name__ == "__main__":
    load_dotenv()
    # Read configuration after loading the project .env file.
    SESSION_ID = os.getenv("NIKKI_SESSION_ID", "").strip()
    PHONE_ADDRESS = os.getenv("NIKKI_PHONE_ADDRESS", "").strip()
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        LOG.info("Bridge stopped.")
