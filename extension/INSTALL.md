# PAIRED Extension — Installation Guide
## For pilot study participants

Thank you for participating in the PAIRED pilot study.
Follow these steps to install the extension in under 2 minutes.

---

## Step 1 — Configure your credentials

Before installing, open the file `config.js` in a text editor and replace the three placeholder values:

```
SUPABASE_URL:      'https://YOUR_PROJECT_ID.supabase.co'
SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_PUBLIC_KEY'
ANTHROPIC_API_KEY: 'YOUR_ANTHROPIC_API_KEY'
WEBAPP_URL:        'https://YOUR_VERCEL_APP.vercel.app'
```

The researcher running the pilot study will provide you with the correct values.
Also replace `YOUR_VERCEL_APP` in `content/content.js` (line with "Open dashboard") and `popup/popup.js`.

---

## Step 2 — Install in Chrome

1. Open Chrome and go to: `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `paired-extension` folder you received
5. The PAIRED Logger extension will appear in your extensions list

---

## Step 3 — Pin the extension (optional but recommended)

1. Click the puzzle piece icon in Chrome's toolbar
2. Find **PAIRED Logger** and click the pin icon

---

## Step 4 — First use

1. Navigate to a conversation on Claude, ChatGPT, or Gemini
2. Click the **PAIRED** tab on the right edge of the screen
3. Sign in with the account details provided by the researcher
4. If this is a new conversation, enter your paper/project title
5. Have your conversation normally
6. When you finish a session, click **End Session**
7. Review the suggested decision points and confirm or delete each one

---

## Notes for pilot participants

- Your data is private — only you can see your log entries
- You can return to the same conversation across multiple sessions; the extension remembers it
- If you accidentally close the tab, your data is already saved — check the dashboard
- The dashboard at `[webapp URL]` shows your full log and generates the disclosure

---

## Feedback

Please note any friction points, confusing steps, or missing features.
Your feedback directly informs both the tool's development and the research paper.
Contact: alkabbany@ieee.org
