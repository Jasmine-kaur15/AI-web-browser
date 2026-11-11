Project Overview
Build Sahayak, a Chrome side-panel AI agent that can understand the page currently open in the browser and help the user act on it safely.
Sahayak should be able to:
● Summarise articles and public YouTube videos in English or Hinglish.
● Chat with the current web page and answer only from the page context.
● Explain, translate, or draft replies from selected page content.
● Read visible screen content through screenshot-based questions.
● Detect interactive elements such as buttons, links, inputs, dropdowns, and checkboxes.
● Turn those elements into a numbered action map that an AI model can reason about.
● Execute browser actions only after the user approves each step.
● Remember a local user profile and reuse it for forms, drafts, and saved one-click skills.
● Apply safety rules that prevent risky actions on sensitive pages or fields.
● Run locally as a Chrome extension using free-tier tools wherever possible.
The project must be completed in 4 weeks and should result in a safe, installable Chrome extension that can be shared through a public GitHub release.
2. Problem Statement
Most AI assistants can explain information, but they are separated from the browser context where users actually work. Users still need to copy text into a chatbot, explain what page they are viewing, identify which field or button matters, and manually carry out every browser step.
More capable browser agents can automate these tasks, but they may be paid, unavailable to some users, or too autonomous for actions that involve personal information or consequential clicks.
The goal of Sahayak is to create a user-controlled browser agent that combines understanding and action while keeping the user in charge.
Sahayak must understand the current page, reason about visible and interactive content, propose one action at a time, and wait for explicit approval before acting. It must also include privacy and safety restrictions so it does not operate on sensitive pages or enter protected information.
3. Primary Goal
At the end of four weeks, a user should be able to open Sahayak in the Chrome side panel on a supported page and do the following:
1. Ask Sahayak to summarise the current article or a public YouTube link.
2. Switch the response language between English and Hinglish.
3. Ask follow-up questions about the page.
4. Use quick actions such as Explain, Translate, and Draft a reply.
5. Ask questions about visible non-text content using a screenshot.
6. Give Sahayak a browser task such as filling a practice form or finding information.
7. Review the next proposed action and choose Approve, Skip, or Stop.
8. Let Sahayak perform only the approved browser action.
9. See a log of the actions that were proposed and performed.
10. Reuse locally stored profile information and saved skills.
Sahayak is not intended to be a fully autonomous browser bot. It is an agent the user controls.
4. Target Platform and Core Stack
Browser
● Google Chrome on desktop.
● Chrome Extension Manifest V3.
● Chrome Side Panel API.
● Chrome content scripts and chrome.scripting for page interaction.
● chrome.tabs.captureVisibleTab for screen capture.
● chrome.contextMenus for right-click actions.
● chrome.storage.local for local memory and preferences.