# 🧠 KB Slackbot – Powered by Model Hub + Monday.com

A Slack bot designed to streamline Knowledge Base (KB) requests from Product Managers and stakeholders. It collects all necessary info via Slack DM, runs a GenAI workflow (via Model Hub), and creates a fully structured task on Monday.com—including Figma links, JIRA, urgency level, and more.

---

## 🚀 What It Does

- 🤖 Launches an interactive step-by-step flow via `/kb-request`
- 🧠 Sends PM input to a custom Model Hub AI Workflow
- 🧾 Auto-parses feature name, request type, urgency, Figma & JIRA links
- 📥 Uploads files directly from Slack
- 📌 Posts a structured KB request as a task on Monday.com

---

## 🛠️ Tech Stack

- Node.js (v18+)
- Slack Bolt SDK
- Monday.com GraphQL API
- Axios for HTTP requests
- Express.js (for health checks)
- dotenv for environment configuration
- Model Hub AI Workflow (via `runWorkflow`)

---

## 🔧 Setup & Configuration

1. **Clone the Repo**
   ```bash
   git clone https://github.com/HilaWix/kb-slackbot.git
   cd kb-slackbot
