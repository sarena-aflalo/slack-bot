# Slack Drive Claude Bot

A Slack bot that answers questions by searching a Google Drive folder and passing relevant document content to Claude.

## How it works

1. User @mentions the bot in Slack with a question
2. Bot searches the configured Google Drive folder for relevant documents
3. Document content is passed to Claude (claude-sonnet-4-6) along with the question
4. Claude answers the question citing the source documents
5. Answer is posted back in the Slack thread

## Supported file types

| Type | Support |
|------|---------|
| Google Docs | Full text extraction |
| Google Sheets | Exported as CSV |
| Google Slides | Exported as plain text |
| `.txt`, `.md`, `.csv` | Full text extraction |
| PDF, images, etc. | Not supported (skipped) |

## Setup

### 1. Slack App

1. Go to https://api.slack.com/apps and create a new app
2. Under **OAuth & Permissions**, add these Bot Token Scopes:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `im:history`
3. Install the app to your workspace and copy the **Bot User OAuth Token** (`SLACK_BOT_TOKEN`)
4. Under **Basic Information**, copy the **Signing Secret** (`SLACK_SIGNING_SECRET`)
5. Under **Event Subscriptions**:
   - Enable events
   - Set the Request URL to: `https://YOUR_RENDER_URL/slack/events`
   - Subscribe to bot events: `app_mention`

### 2. Google Drive

1. In Google Cloud Console, create a service account and download the JSON key
2. Share the target Google Drive folder with the service account email (Viewer access)
3. Copy the folder ID from the Drive URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`

### 3. Environment Variables

Copy `.env.example` to `.env` and fill in all values. For `GOOGLE_SERVICE_ACCOUNT_JSON`, paste the entire service account JSON as a single-line string.

### 4. Deploy to Render

1. Push this repo to GitHub
2. Create a new **Web Service** on Render pointing to the repo
3. Render will detect `render.yaml` automatically
4. Add all environment variables in the Render dashboard under **Environment**

### Local development

```bash
npm install
cp .env.example .env
# fill in .env values
npm run dev
```

Use [ngrok](https://ngrok.com) to expose your local server so Slack can reach it:

```bash
ngrok http 3000
```

Then set the Slack Event Subscriptions URL to your ngrok URL + `/slack/events`.

## Limitations

- Documents larger than 8,000 characters are truncated
- Up to 5 documents are fetched per query
- PDFs and binary files are skipped
