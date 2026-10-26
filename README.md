# Quarterback (Google Forms edition)
`server/` = professor dashboard + API (Python, no dependencies). `dist/` = the student Chrome extension.

## Professor
1. `cd server && python server.py`. It prints the dashboard address and a **Student extension** download link (`.../extension.zip`). Allow port 8765 through the firewall. If students reach you at a different address (e.g. a tunnel), run `python server.py --public https://your-address`.
2. Open the dashboard, Create an account, sign in. Download the student zip from the top of the page and share it with students (Drive, LMS, etc). The server address is already set inside it.
3. In Google Forms: Settings > Responses > Limit to 1 response, Collect email addresses = Verified. Send > link (must end in `/viewform`).
4. Add test: paste link, title, strikes, mode (Enforce / Record only), fullscreen, copy/paste, blocked sites, allow-list. Click **Go live**, send students the same Form link.
5. Monitor live; click **Unlock** for locked students (they reopen within ~5 s). Click a name for their timeline.
6. Turn off Accepting responses in Forms, click **End test**. Export Attempts/Events CSV, or drop the Forms responses CSV in to compare emails (done in your browser only).

## Student: set up the extension (once, before exam day; Chrome on laptop/desktop)
1. Download the zip from the link your professor gave you.
2. Unzip it somewhere permanent. Do not move or delete it afterwards.
3. Open the unzipped folder and find the `dist` folder. The `dist` folder is the extension.
4. In Chrome, go to `chrome://extensions`.
5. Turn on Developer mode (top right).
6. Click Load unpacked and select the `dist` folder (the one containing `manifest.json`).
7. Make sure the Quarterback card is switched on.
8. Click Details on the card and turn on Allow in incognito.

## Student: take the exam
Open the exam link signed in to Google, enter your name and the email you are signed in with, tick consent, press Start exam. Each time you leave the exam tab/window is a strike (warning, final warning, lock). If locked, message your professor from another device with your name and email.

## Score and limits
Starts at 100: strike -10, each second away -0.5 (max -30), blocked site -15, changing question within 10 s of returning -5, copy/paste/devtools attempt -2 (max -10), connection gap 0. A prompt to review, not a verdict. Cannot stop a second device; the lock is enforced by the extension, not the server; question number is best effort.
