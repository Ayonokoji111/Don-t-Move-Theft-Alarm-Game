 Don't Move! — Theft Alarm Game

A motion-detection game that connects a phone running the nikki Streams app to a web dashboard. The game receives real motion sensor readings, calibrates the phone while it is resting on a table, and compares movement against configurable thresholds. If the phone moves beyond the threshold, a funny alarm plays and the player loses. If the phone remains sufficiently still until the countdown ends, the player wins.

 Run it

1. Prepare the phone - 
In the nikki Streams app, create or open your session and connect your Android phone. Enable the Accelerometer, Gyroscope, and Linear Acceleration sensors. Enable Orientation if the implementation uses it. Keep the phone and computer on the same local network. Use the current WebSocket address shown in Streams. The currently configured address is `IP:PORT`; it may change when the network changes, so update the configuration if necessary.

2. Install Python and dependencies - 
Install Python 3.10 or newer. Open a terminal in this project folder and create a virtual environment.

   macOS:
   In bash
   python3 -m venv .venv
   source .venv/bin/activate
   python -m pip install -r requirements.txt
   

   Windows PowerShell:
   In powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   py -m pip install -r requirements.txt
   

3. Configure the Streams connection. Set `NIKKI_SESSION_ID` to the session ID from your Streams app and `PHONE_ADDRESS` to the current Streams host and port. Keep your session ID private; do not commit it to GitHub.

   macOS:
   In bash
   export NIKKI_SESSION_ID="YOUR_STREAMS_SESSION_ID"
   export PHONE_ADDRESS="IP:PORT"
   

   Windows PowerShell:
   In powershell
   $env:NIKKI_SESSION_ID = "YOUR_STREAMS_SESSION_ID"
   $env:PHONE_ADDRESS = "IP:PORT"
   

   These commands configure the values for the current terminal session. Follow the actual configuration options implemented in `sensor_bridge.py` if they differ.

4. Start the sensor bridge.From the project folder, run:

   In bash
   python sensor_bridge.py
   

   Keep the terminal open while playing. The bridge must successfully connect to nikki Streams and provide valid sensor readings to the game. If your implementation uses a different startup command or requires a separate web server, follow the commands in the project files.

5. Open the game. Open `index.html` using the serving method documented in the project. If the frontend uses a local HTTP server, open a second terminal and run:

   In bash
   python3 -m http.server 8080
   

   Then open [http://localhost:8080](http://localhost:8080) on your computer.

   To access the dashboard on your Android phone, use your computer's current Wi-Fi IPv4 address, for example `http://YOUR-COMPUTER-IP:8080`, if the network and browser configuration permit it. Ensure the browser's WebSocket URL matches the actual bridge address and port. Do not assume that the example URL works without checking the implemented configuration.

6. Play the game. Confirm the sensor connection is active, place the phone on a stable surface, and press Start Game. Wait for calibration to finish. Keep the phone still until the selected timer reaches zero. Moving the phone beyond the configured threshold triggers the loss state and alarm. Use Stop Game or Reset Game to end or restart a round.

 How it works


Android phone motion sensors
             ↓
       nikki Streams
             ↓
    Python SDK callback
             ↓
   Sensor data validation
             ↓
 Calibration and noise filtering
             ↓
  Movement threshold comparison
             ↓
       Game state logic
          ↙       ↘
   Phone stayed   Movement
       still      detected
          ↓          ↓
      Player wins  Play alarm
                   Player loses
             ↓
        Web dashboard


The Python bridge uses the nikki Streams SDK to initialize a session, connect to the phone, and receive sensor events. The JavaScript frontend receives sensor data from the bridge and processes it for the game.

The game uses Linear Acceleration as the primary movement signal where available. The Accelerometer provides acceleration measurements that may include gravity, while the Gyroscope measures rotation rate. Orientation can provide additional information about changes in the phone's position.

During calibration, the game collects resting readings and establishes a baseline. It then compares incoming readings against configurable movement thresholds. Noise filtering and a short persistence interval help reduce false alarms caused by minor sensor fluctuations.

The default round duration is 30 seconds, with additional duration options available in the interface if implemented. If movement exceeds the configured threshold, the game transitions to the loss state and plays a funny alarm using the browser's audio capabilities. If the timer finishes while the sensor connection remains valid and no qualifying movement has occurred, the player wins.

Sensor disconnection, stale readings, invalid data, and connection failures must be reported as errors rather than treated as wins. Exact sensor fields, thresholds, bridge URLs, and retry behaviour depend on the implementation in `sensor_bridge.py` and `script.js`.

 Features

- Live motion sensor readings.
- Sensor connection status.
- Initial sensor calibration.
- Configurable movement sensitivity.
- Countdown timer and multiple round durations.
- Movement-triggered alarm and loss state.
- Stillness-based win condition.
- Stop and reset controls.
- Error handling for sensor and connection failures.
- Responsive dashboard for desktop and Android browsers.

Notes and limitations

- The phone and computer must be able to communicate with the nikki Streams server.
- The Streams session ID is required if the SDK uses session-based initialization.
- The configured IP address may change when the network changes.
- Browser access to the game and the bridge must satisfy the relevant network and browser security requirements.
- Sensor readings vary between devices, so movement thresholds may need adjustment.

For setup details, see `PYTHON_SETUP.md`. For test cases and recorded results, see `TESTING.md`.