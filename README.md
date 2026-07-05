# Vaani

Vaani is a voice-first form assistant for government service workflows. The app lets a user choose a language, select a supported service, answer form questions by voice, review the collected data, and then trigger browser automation to fill the matching web form.

The current project uses local dummy forms for development:

- Ration Card Application
- Voter ID Application
- Family Data Collection Form

## Tech Stack

- Next.js 15, React 19, TypeScript, Tailwind CSS
- Python HTTP server for form schema extraction and automation
- Playwright over Chrome DevTools Protocol
- Browser speech recognition / speech synthesis, with a server-side TTS proxy for cloud audio playback

## Project Structure

```text
src/
  app/                  Next.js app routes
  components/           Main voice assistant UI
  lib/                  i18n and TTS helpers
backend/
  main.py               Local API server and Playwright automation
  requirements.txt      Python dependencies
dummy_forms/            Local HTML forms used as test portals
```

## Prerequisites

- Node.js 20 or newer
- Python 3.10 or newer
- Google Chrome installed at `C:\Program Files\Google\Chrome\Application\chrome.exe`

## Setup

Install frontend dependencies:

```bash
npm install
```

Create and activate a Python virtual environment:

```bash
python -m venv .venv
.venv\Scripts\activate
```

Install backend dependencies:

```bash
pip install -r backend/requirements.txt
playwright install chromium
```

## Run Locally

Start the Python automation server:

```bash
python backend/main.py
```

In a second terminal, start the Next.js dev server:

```bash
npm run dev
```

Open the app at:

```text
http://localhost:3000
```

The backend runs at `http://127.0.0.1:8000`. Next.js forwards `/api/services`, `/api/schema`, and `/api/fill` to that backend.

## How It Works

1. The user chooses English, Hindi, or Bengali.
2. The app listens for a supported service request.
3. The frontend asks the backend for the live form schema.
4. The backend opens the matching dummy form in Chrome and extracts visible fields.
5. The assistant collects answers by voice and shows a summary.
6. After confirmation, the backend uses Playwright to fill the form in Chrome.

## Useful Scripts

```bash
npm run dev      # Start the Next.js development server
npm run build    # Build the frontend
npm run start    # Start the production frontend server
npm run lint     # Run linting
```

## Notes

- Keep the Python server running while using the app.
- Chrome is launched with remote debugging on port `9222`.
- Dummy form URLs are configured in `SERVICE_PORTAL_MAP` inside `backend/main.py`.
- To add a new service, add a dummy or real portal URL in the backend map and add matching voice metadata in `src/components/EchoJSONApp.tsx`.
