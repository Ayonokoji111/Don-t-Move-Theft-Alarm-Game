Don't Move! Theft Alarm Game

About the game

Don't Move! is a simple game that uses the motion sensors in an Android phone. Put the phone on a table and try to keep it still until the timer ends. If the phone moves, the game ends and can play an alarm sound.


 What you need

- A Windows, Mac, or Linux computer
- An Android phone with Nikki Streams installed
- The computer and phone connected to the same Wi-Fi network
- Python 3.10 or newer installed on the computer
- A Nikki Streams session ID

In Nikki Streams, turn on these sensors:

- Accelerometer
- Gyroscope
- Linear Acceleration

The game does not need GPS, microphone, camera, or NFC.

Download the project

Download all the project files and put them together in one folder. If the files come as a ZIP file, extract the ZIP first. Open that folder in VS Code or another editor.

Make sure the folder contains `sensor_bridge.py`, `requirements.txt`, `index.html`, `style.css`, `script.js`, and `.env.example`.

 Create the Python environment

Open a terminal in the project folder. In VS Code, you can open the terminal from the **Terminal** menu.

Create a virtual environment. Use the command for your computer:

**Windows PowerShell:**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell does not allow activation, open Command Prompt and run:

```bat
.venv\Scripts\activate.bat
```

**Mac or Linux:**

```sh
python3 -m venv .venv
source .venv/bin/activate
```

With the environment active, install the project packages:

```sh
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If `python` is not recognised on Windows, install Python from python.org and select the option to add Python to PATH. On Mac or Linux, use `python3` instead of `python` when creating the environment if needed.

Add your Nikki Streams details

Make a copy of `.env.example` in the same folder and name the copy `.env`. Keep `.env.example` as it is. Open `.env` in your editor and enter your real session ID and the current phone address shown by Nikki Streams:

```dotenv
NIKKI_SESSION_ID="your_real_session_id"
NIKKI_PHONE_ADDRESS="IP"//ws address or web socket address
```

Replace the example address with the current address shown on your phone. Phone addresses can change. Do not share the `.env` file because it contains your private session ID.

 Start the game

1. Make sure Nikki Streams is running on the phone. Turn on the three sensors listed above and start its Streams server.
2. Make sure the computer and phone are on the same Wi-Fi network.
3. In the terminal where the virtual environment is active, run:

   ```sh
   python sensor_bridge.py
   ```

   On some Mac or Linux systems, use `python3 sensor_bridge.py`.

4. Leave the terminal open. On the computer, open a web browser and go to <http://127.0.0.1:8000>.
5. Wait for the page to show that the phone is connected and sensor readings are arriving.
6. Put the phone on a steady surface, choose a time, and press **Start Game**.
7. Keep the phone still until the timer ends. Use **Stop** to end a round early or **Reset** to prepare for another round.

The game page should be opened on the computer running the bridge, not on the phone. The bridge listens only on that computer. To stop the program, return to the terminal and press **Ctrl+C**.

 How to play

The game checks the phone for about two seconds before the timer starts. This gives it a starting reading for a still phone. Small changes are ignored. Movement that lasts longer than a brief shake ends the round.

- The **Accelerometer** measures movement and gravity.
- The **Gyroscope** measures turning.
- **Linear Acceleration** measures movement without gravity and is the main sensor used by the game.

Choose **Forgiving** if small movements end the game too easily. Choose **Strict** if the game does not notice movement. Results vary between phones and surfaces.

The game only awards a win if the full timer finishes while fresh sensor readings are arriving. If the phone disconnects or readings stop, the round ends with an error instead of a win. The sound is made by the browser and can be turned off with the sound switch. Your best time is saved in that browser on that computer.

If it does not connect

- Check that Nikki Streams is open and its Streams server is running.
- Check that Accelerometer, Gyroscope, and Linear Acceleration are turned on.
- Check that the phone and computer are on the same Wi-Fi network.
- Check the phone's current address and port. Update `NIKKI_PHONE_ADDRESS` in `.env` if they changed.
- Check that `NIKKI_SESSION_ID` in `.env` is correct.
- Look at the terminal for an error message.
- After changing `.env`, stop the program with **Ctrl+C** and start it again.
- If the page says the address is already in use, another copy may already be running. Stop that copy with **Ctrl+C** before starting the program again.

The address `192.168.29.101:3000` was reachable from the project computer during setup, but the phone sensor connection and a full game have not yet been tested. Use the current address shown by Nikki Streams.

Project files

- `index.html` is the game page.
- `style.css` controls the page design.
- `script.js` runs the game in the browser.
- `sensor_bridge.py` connects the phone to the game.
- `requirements.txt` lists the Python packages to install.
- `.env.example` is a sample settings file. Copy it to `.env` and add your private details.
- `PYTHON_SETUP.md` has extra Python setup information.
- `TESTING.md` has a checklist for testing the game with a phone.
