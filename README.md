# Don't Move! Theft Alarm Game

A phone-motion game for Android and a computer. Keep the phone still until the timer ends. If it moves, the round ends and the browser can play an alarm.

This is a learning project, not a real security alarm.

## Run it

1. Download or copy all project files into one folder. Open that folder in VS Code. Open a terminal in the same folder.
2. Install Python 3.10 or newer. Python 3.12 is recommended.
3. Create a virtual environment and install the packages.

   **macOS or Linux:**

   ```sh
   python3.12 -m venv .venv
   source .venv/bin/activate
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   cp .env.example .env
   ```

   Run the copy command only if `.env` does not already exist. It can replace your saved settings.

   **Windows PowerShell:**

   ```powershell
   py -3.12 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   Copy-Item .env.example .env
   ```

   Run the copy command only if `.env` does not already exist. Keep the file private.

   If PowerShell blocks activation, use Command Prompt instead:

   ```bat
   .venv\Scripts\activate.bat
   ```

4. Open `.env` in VS Code. Enter your real Nikki Streams session ID and the phone's current address and port:

   ```dotenv
   NIKKI_SESSION_ID=your_session_id
   NIKKI_PHONE_ADDRESS=192.168.29.101:3000
   ```

   The address above is the one currently shown in the project configuration. Phone addresses can change, so check Nikki Streams and update it if needed. Keep your session ID private. The `.gitignore` file excludes `.env`.

5. On the Android phone, open Nikki Streams, start its Streams server, and enable these sensors:
   - Accelerometer
   - Gyroscope
   - Linear Acceleration

   The game does not use GPS, microphone, camera, NFC, or the other listed sensors. Keep the phone and computer on the same Wi-Fi network.

6. In the terminal with the virtual environment active, start the bridge:

   ```sh
   python sensor_bridge.py
   ```

   Leave the terminal open. On the same computer, open <http://127.0.0.1:8000> in a browser. Wait for the page to show a phone connection and live readings before starting a round. The browser page is served on the computer; it is not set up to open directly on the phone.

7. Choose 15, 30, or 60 seconds. The default is 30 seconds. Put the phone on a stable surface and press **Start Game**. Press **Stop** to end a round early, or **Reset** to prepare for another round. To stop the bridge, return to the terminal and press **Ctrl+C**.

If you change `.env`, stop and restart the bridge so it loads the new settings.

## How it works

```text
Android phone sensors
        ↓
Nikki Streams app and server
        ↓
nikki-streams Python SDK
        ↓
sensor_bridge.py
        ↓
Local WebSocket at 127.0.0.1:8765
        ↓
Browser game at http://127.0.0.1:8000
```

The bridge uses the SDK to connect to the phone. In simplified form, the connection is:

```python
SDK.initialize(SESSION_ID)
device = SDK.create_device(PHONE_ADDRESS, sdk_callback)
await device.connect()
```

The session ID is read from `.env`; it is not written in the browser code. The bridge sends valid sensor readings to the browser as JSON, for example:

```json
{
  "type": "sensor",
  "timestamp": 1234567890,
  "accel": [0.02, -0.06, 9.81],
  "gyro": [0.0, 0.0, 0.0],
  "linearAcceleration": [0.0, 0.0, 0.0]
}
```

The values above only show the message format. The bridge does not make up readings. It sends readings received from Nikki Streams after checking that the sensor values are valid.

### Calibration and movement

When a round starts, the game collects live readings for about 1.8 seconds while the phone is still. It needs at least five valid readings to set a starting point. Linear acceleration is the main movement signal. The game also checks the gyroscope and accelerometer when those readings are available.

The accelerometer includes gravity, even when the phone is still. The game compares it with the starting reading instead of treating gravity itself as movement. The gyroscope measures turning speed. Linear acceleration measures movement without gravity.

The game calculates a movement score by comparing each new reading with the starting values. It uses the highest available score. The default sensitivity is **Normal**. The other choices are **Forgiving** and **Strict**. The thresholds are starting values and may need adjustment for a different phone or surface:

| Sensitivity | Linear acceleration | Gyroscope | Accelerometer |
| --- | ---: | ---: | ---: |
| Forgiving | 2.2 m/s² | 1.0 rad/s | 3.2 m/s² |
| Normal | 1.25 m/s² | 0.65 rad/s | 2.1 m/s² |
| Strict | 0.72 m/s² | 0.36 rad/s | 1.25 m/s² |

The game adjusts these thresholds using the noise measured during calibration. Movement must pass a threshold for about 260 milliseconds to end the round. Readings older than 1.6 seconds are treated as stale.

A simplified part of the score calculation is:

```javascript
const linearDelta = distance(reading.linear, state.baseline.linear);
const gyroSpeed = magnitude(reading.gyro);
const accelDelta = distance(reading.accel, state.baseline.accel);

const components = [];
if (linearDelta !== null && state.baseline.linear) {
  components.push(linearDelta / Math.max(t.linear, state.calibrationNoise * 4));
}
if (gyroSpeed !== null && state.baseline.gyro) {
  components.push(gyroSpeed / Math.max(t.gyro, state.gyroNoise * 4));
}
if (accelDelta !== null && state.baseline.accel) {
  components.push(accelDelta / Math.max(t.accel, state.accelNoise * 4));
}

return Math.max(0, ...components);
```

The actual code also adjusts thresholds using the noise measured during calibration.

### Timer, results, and sound

The timer starts after calibration. It uses elapsed time, so small delays in browser updates do not make the round longer or shorter. If the full timer ends while valid readings are still arriving, the player wins. If movement passes the threshold long enough, the player loses. A lost or disconnected sensor stops the round with an error; it cannot count as a win.

The alarm is generated by the browser with the Web Audio API after the player presses **Start Game**. It plays once on a loss. Use the sound switch to mute it. A sound problem does not change the result of the round. The best time is saved in that browser on that computer.

## Network and local ports

The Python bridge serves the page at `127.0.0.1:8000` and accepts the browser connection at `127.0.0.1:8765`. Both addresses are limited to the computer running the program. The bridge connects outward to the phone address in `.env`.

Use the browser on the same computer as the bridge. On a phone, `127.0.0.1` means the phone itself, not the computer.

## Troubleshooting

- **The page does not open:** Make sure `python sensor_bridge.py` is still running. If a port is already in use, stop the other copy with **Ctrl+C**.
- **The phone does not connect:** Start the Streams server in Nikki Streams. Check the session ID, current phone address, port, and Wi-Fi. Some guest Wi-Fi networks block devices from connecting to each other.
- **No sensor readings appear:** Enable Accelerometer, Gyroscope, and Linear Acceleration in Nikki Streams. Wait for live readings before pressing Start.
- **The game reports invalid or stale readings:** Check that the phone server is still running and sending data. The round stops safely if readings are invalid or stop arriving.
- **The alarm is silent:** Check the sound switch, computer volume, and browser audio settings. The alarm is generated locally and needs no audio file.
- **The connection drops:** The round stops and does not count as a win. Restart the Streams server and the Python bridge, then try again.

## Testing and limits

The project owner has confirmed that the local checks, phone connection, and gameplay tests passed. Results can depend on the phone, its current address, Wi-Fi, and Nikki Streams settings. Repeat the checks in [TESTING.md](TESTING.md) after changing any of these. See [PYTHON_SETUP.md](PYTHON_SETUP.md) for extra setup help.

Test a still round through the full timer, then test a movement-triggered loss and alarm. Also check Stop, Reset, sensitivity settings, and what happens when the phone disconnects. Do not use this game as a real theft alarm.
