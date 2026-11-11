# 📦 Installation & Setup Guide: Sahayak AI Browser Agent

Welcome to **Sahayak (सहायक)**! This guide will help you install, configure, and run Sahayak on Google Chrome in less than **3 minutes**.

---

## 📋 System Requirements

- **Browser:** Google Chrome (Version 116+ required for Chrome Side Panel API support).
- **Operating System:** Windows 10/11, macOS (Intel / Apple Silicon), or Linux.
- **Node.js (For source builds only):** Node.js v18.0.0 or higher (v20+ / v22+ recommended) and `npm`.

---

## ⚡ Method 1: Install from Release Package (Fastest)

If you downloaded the release archive [`sahayak-v1.0.1.zip`](https://github.com/hemanpreetk/AI-BROWSER/releases), follow these simple steps:

### Step 1: Extract the Archive
1. Download `sahayak-v1.0.1.zip`.
2. Extract the zip file to a permanent folder on your computer (e.g. `C:\Users\<YourUser>\Extensions\sahayak-ai-browser` or `~/Extensions/sahayak-ai-browser`).
3. Inside, you will find the `dist` folder containing `manifest.json`, `background/`, `content/`, and `sidepanel/`.

### Step 2: Load into Google Chrome
1. Open Google Chrome.
2. In the address bar, type `chrome://extensions` and press **Enter**.
3. In the top-right corner, switch the **Developer mode** toggle to **ON**.
4. In the top-left toolbar that appears, click the **Load unpacked** button.
5. In the file picker, select the `dist` folder.
6. **Sahayak - AI Browser Agent** will now appear in your extensions list!

### Step 3: Pin the Extension
1. Click the **Extensions puzzle piece icon (🧩)** in the top-right of your Chrome toolbar.
2. Find **Sahayak - AI Browser Agent** and click the **Pin icon (📌)** so it is always accessible.

---

## 🛠 Method 2: Build & Install from Source (For Developers)

If you are contributing or customizing Sahayak, you can build the extension directly from the TypeScript source code:

```bash
# 1. Clone the repository
git clone https://github.com/hemanpreetk/AI-BROWSER.git
cd AI-BROWSER

# 2. Install dependencies
npm install

# 3. Compile the production bundle
npm run build

# 4. Verify test suite (170/170 passing tests)
npm test

# 5. (Optional) Run development watcher
npm run dev
```

Once `npm run build` completes, follow the same steps in **Method 1, Step 2** to load the newly compiled `dist` directory in Chrome.

---

## ⚙️ Initial Configuration (Bring Your Own Key)

Sahayak connects directly to AI models from your browser using your own personal API keys. No third-party accounts, proxy servers, or credit cards are required.

### 1. Open the Side Panel
- Click the pinned **Sahayak icon (🌟)** in your Chrome toolbar, or
- Press the keyboard shortcut:
  - **Windows / Linux:** `Alt + Shift + S`
  - **Mac:** `Option + Shift + S`

### 2. Enter Your Free API Key
1. Click the **Gear icon (⚙️)** in the top-right corner of the Sahayak side panel.
2. Choose your preferred AI Provider:
   - **Google Gemini (Recommended):** Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
   - **Groq Cloud (Ultra-Fast Inference):** Get a free API key at [Groq Console](https://console.groq.com/keys).
3. Paste your API key into the input field.
4. (Optional) Select your preferred language:
   - **English (EN):** Concise, professional English instructions.
   - **Hinglish (HI-EN):** Natural, conversational Hindi written in clean Latin script.
5. Click **Save Settings**.
6. A green confirmation badge will show that your key is active and ready!

---

## 👤 Setting Up Your Profile Vault (Optional)

To enable 1-click smart form autofill on flight bookings, job applications, surveys, and multi-step forms:

1. Click the **Profile** tab in the side panel navigation bar.
2. Enter your details:
   - Full Name, First Name, Last Name
   - Email Address
   - Phone Number
   - City, State, Country, Postal Code
   - Job Title / Company
3. Click **Save Profile**.
4. Data is stored strictly on your local computer (`chrome.storage.local`). It is never uploaded to the cloud or shared with third parties.

---

## 🧪 Testing with the Practice Sandbox

To test all of Sahayak's features without altering real websites or shopping carts, use the built-in practice sandbox:

```bash
npm run practice
```

1. Open your browser to `http://localhost:4173/`.
2. Open the Sahayak Side Panel (`Alt + Shift + S`).
3. Switch to the **Actions** tab.
4. Try goals such as:
   - *"Fill passenger name as Rohan Mehra and select Business Class"*
   - *"Choose Volvo from dropdown and select Bike checkbox"*
   - *"Go to the Multi-Step Wizard and fill my profile"*
5. Observe:
   - Yellow numbered badges (`#1`, `#2`...) render over interactive elements.
   - Sensitive password and OTP fields have **no badges** and remain completely protected.
   - The **HITL Approval Card** prompts you to approve each step by pressing **Enter**.

---

## 🔒 Chrome Permissions Explained

Sahayak requests only the minimal permissions required to function as an in-browser assistant:

| Permission | Reason for Request |
| :--- | :--- |
| `sidePanel` | Displays the assistant chat and action supervisor alongside your webpage without covering content. |
| `activeTab` | Allows reading the current tab's DOM for article extraction and Set-of-Marks mapping only when invoked. |
| `scripting` | Injects the badge overlay stylesheet and DOM scanner into the active tab. |
| `storage` | Stores your API keys, language preference, and Profile Vault locally on your device. |
| `contextMenus` | Enables right-click context menu shortcuts (*Explain*, *Translate*, *Draft Reply*). |
| `tabs` | Captures screenshots for multimodal vision analysis and monitors in-page SPA URL changes. |

---

## ❓ Troubleshooting & FAQs

### Q1: The Side Panel says "Chrome extension APIs unavailable. Please reload the webpage tab."
- **Solution:** When an extension is updated or newly loaded, existing open browser tabs need to be refreshed once so the new content scripts can connect. Simply refresh your webpage (`F5` or `Ctrl+R`) and try again.

### Q2: "Action Planning Failed: Webpage contains active password input fields."
- **Solution:** In earlier versions, pages with password fields triggered a whole-page lockout. In v1.0.1+, Sahayak isolates and hides passwords from automation (no badges are drawn on them), while allowing you to autofill normal profile fields (name, email, dates). If you encounter this on an older build, reload the extension at `chrome://extensions`.

### Q3: Why does localhost show a safety shield?
- **Solution:** For your security, private local network addresses (`192.168.*`, `10.*`) are protected by the Safety Guard to prevent automated probing of internal intranet networks. The practice sandbox on port `4173` is whitelisted by default, and you can click **⚡ Enable Practice on Localhost** in the security banner on any local development port.

### Q4: How do I update to a newer release?
- **Solution:**
  1. Download the new release zip.
  2. Overwrite your existing `dist` folder.
  3. Go to `chrome://extensions` and click the **Reload icon (🔄)** on the Sahayak card.

---

## 🤝 Support & Feedback

If you experience any issues or have questions, please open an issue on the [GitHub Repository](https://github.com/hemanpreetk/AI-BROWSER/issues).

