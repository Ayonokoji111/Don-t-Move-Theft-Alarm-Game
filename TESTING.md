Testing the Game

 Checked on the computer

These checks passed:

- The Python and JavaScript files have no syntax errors.
- The needed Python packages are installed.
- The game page opens on the computer.
- The local connection between the game page and bridge works.


Local game page and bridge: Passed.
Python and JavaScript syntax checks: Passed.
Phone sensor connection and gameplay: Tested and Passed.
Full tested version: Passed.

Try it with the phone

1. Connect the phone and computer to the same Wi-Fi.
2. In Nikki Streams, turn on Accelerometer, Gyroscope, and Linear Acceleration. Start the Streams server.
3. Check the phone's current address in Nikki Streams. If it changed, update `NIKKI_PHONE_ADDRESS` in `.env` and restart the bridge.
4. Start the bridge. Open the game page on the computer and wait for live readings.
5. Keep the phone still through calibration and the full timer. Check that the game shows a win.
6. Start another round and move the phone after calibration. Check that the round ends and the alarm plays if sound is on.
7. Try Stop, Reset, the sensitivity settings, and disconnecting the phone during a round.

