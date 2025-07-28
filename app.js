// app.js
require('dotenv').config();
const { App } = require('@slack/bolt');
const { createMondayItem } = require('./monday');

// ——— Initialize Bolt in Socket Mode ———
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,    // xoxb-…
  appToken: process.env.SLACK_APP_TOKEN, // xapp-…
  socketMode: true,
});

// ——— In‑memory session store for DM‑based Q&A ———
const sessions = {};

// ——— Slash command: kick off a DM Q&A ———
app.command('/kb-request', async ({ command, ack, client }) => {
  await ack();
  const { channel } = await client.conversations.open({ users: command.user_id });
  sessions[command.user_id] = { step: 1, data: {} };
  await client.chat.postMessage({
    channel,
    text: '📝 Let’s get started. What’s the **Subject** for your KB request?',
  });
});

// ——— DM listener: step‑by‑step Q&A, including attachments ———
app.event('message', async ({ event, client }) => {
  // ignore non‑DMs and bot messages
  if (event.channel_type !== 'im' || event.bot_id) return;

  const user = event.user;
  const session = sessions[user];
  if (!session) return; // ignore DMs you didn’t initiate

  const text = (event.text || '').trim();
  const files = event.files || [];

  switch (session.step) {
    case 1:
      session.data.subject = text;
      session.step = 2;
      return client.chat.postMessage({
        channel: event.channel,
        text: '✅ Got it. What’s the **Task Type**? (e.g., Quick Update, New Feature)',
      });

    case 2:
      session.data.taskType = text;
      session.step = 3;
      return client.chat.postMessage({
        channel: event.channel,
        text: '✅ Thanks. Which **Product** is this for?',
      });

    case 3:
      session.data.product = text;
      session.step = 4;
      return client.chat.postMessage({
        channel: event.channel,
        text: '✅ Great. Please provide a **Description**.',
      });

    case 4:
      session.data.description = text;
      session.step = 5;
      return client.chat.postMessage({
        channel: event.channel,
        text: '✅ Almost done! If you have **screenshots or files**, upload them now. When you’re ready, type `submit`.',
      });

    case 5:
      if (files.length) {
        session.data.files = session.data.files || [];
        for (const f of files) session.data.files.push(f.id);
        return client.chat.postMessage({
          channel: event.channel,
          text: `👍 Captured ${files.length} file(s). Upload more or type \`submit\`.`,
        });
      }
      if (text.toLowerCase() === 'submit') {
        // fire off to Monday.com
        await createMondayItem({ ...session.data, user });
        await client.chat.postMessage({
          channel: event.channel,
          text: '🎉 Your KB request has been submitted to the Monday.com board!',
        });
        delete sessions[user];
      }
      return;
  }
});

// ——— Start the app ———
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ KB Request Bot running in Socket Mode');
})();
