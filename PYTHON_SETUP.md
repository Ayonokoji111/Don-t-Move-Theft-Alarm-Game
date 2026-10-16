 Python Setup

This guide explains how to prepare and start the game on Windows, Mac, or Linux.

 What you need

- Python 3.10 or newer. Python 3.12 is recommended.
- The game files downloaded into one folder.
- Nikki Streams installed on your Android phone.

 Open the project folder

Open the folder containing the game files in VS Code. Open a terminal in VS Code from the **Terminal** menu. The terminal should be working inside the project folder, where you can see `sensor_bridge.py` and `requirements.txt`.

 Create the Python environment

A virtual environment keeps this game's Python packages together.

On Windows PowerShell, run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell does not allow the activation command, use Command Prompt and run:

```bat
.venv\Scripts\activate.bat
```

On Mac or Linux, run:

```sh
python3 -m venv .venv
source .venv/bin/activate
```

When it is active, install the packages:

```sh
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If a command says Python cannot be found, install Python and reopen VS Code. On Windows, try `py` instead of `python` when creating the environment. On Mac or Linux, use `python3`.

 Add your Nikki Streams details

In the project folder, make a copy of `.env.example` and name the copy `.env`. Open `.env` and enter your real Nikki Streams session ID and the current phone address shown in Nikki Streams:

```dotenv
NIKKI_SESSION_ID=your_real_session_id
NIKKI_PHONE_ADDRESS="your_phone_ip:3000"
```

Replace the example values with your own. Do not share the `.env` file. It contains your private session ID.

Set up the phone

1. Connect the phone and computer to the same Wi-Fi network.
2. Open Nikki Streams on the phone and start its Streams server.
3. Turn on Accelerometer, Gyroscope, and Linear Acceleration.
4. Check the phone's current address in Nikki Streams. If it changes, update `NIKKI_PHONE_ADDRESS` in `.env`.

The game does not need GPS, microphone, camera, or NFC.

Start and stop the game

In the same terminal, with the virtual environment active, run:

```sh
python sensor_bridge.py
```

On some Mac or Linux computers, use `python3 sensor_bridge.py`.

Leave the terminal open. On the same computer, open a browser and go to <http://127.0.0.1:8000>. Wait until the page shows that the phone is connected and sensor readings are coming in. The game page should be opened on the computer, not the phone.

To stop the game, return to the terminal and press **Ctrl+C**. If you change `.env`, stop and start the program again for the changes to take effect.

 If it does not connect

- Make sure Nikki Streams is open and its Streams server is running.
- Check that the three required sensors are turned on.
- Make sure the phone and computer are on the same Wi-Fi network.
- Check the phone address and session ID in `.env`.
- Read the message shown in the terminal and on the game page.
- If the page says an address is already in use, another copy may be running. Find its terminal and stop it with **Ctrl+C** before starting again.
- If the phone address changes, update `.env` and restart the program.

A connection error does not always mean the session ID is wrong. The phone server may be stopped, the address may have changed, or the Wi-Fi may block the connection. The game does not create pretend sensor readings; it needs a real connection to the phone.
