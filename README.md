# >à KB Slackbot  Powered by Model Hub + Monday.com

A Slack bot designed to streamline Knowledge Base (KB) requests from Product Managers and stakeholders. It collects all necessary info via Slack DM, runs a GenAI workflow (via Model Hub), and creates a fully structured task on Monday.comincluding Figma links, JIRA, urgency level, and more.

---

## <¯ What It Does

- > Launches an interactive step-by-step flow via `/kb-request`
- >à Sends PM input to a custom Model Hub AI Workflow
- =Ë Auto-parses feature name, request type, urgency, Figma & JIRA links
- =å Uploads files directly from Slack
- =î Posts a structured KB request as a task on Monday.com

---

## =à Tech Stack

- Node.js (v18+)
- Slack Bolt SDK
- Monday.com GraphQL API
- Axios for HTTP requests
- Express.js (for health checks)
- dotenv for environment configuration
- Model Hub AI Workflow (via `runWorkflow`)

---

## =' Setup & Configuration

1. **Clone the Repo**
   ```bash
   git clone https://github.com/wix-playground/kb-slackbot.git
   cd kb-slackbot
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Variables**
   Create a `.env` file with:
   ```env
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_APP_TOKEN=xapp-your-app-token
   MONDAY_API_TOKEN=your-monday-token
   MONDAY_BOARD_ID=your-board-id
   WORKFLOW_URL=your-model-hub-workflow-url
   ```

4. **Run the App**
   ```bash
   npm start
   ```

---

## =€ Deployment

This app is deployed on Render and connects to Slack via Socket Mode for real-time interactions.

---

## =Ý Usage

1. Open Slack
2. Type `/kb-request` in any channel or DM
3. Follow the interactive prompts
4. Your KB request will be automatically created in Monday.com!