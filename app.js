require('dotenv').config();
const { App } = require('@slack/bolt');
const express = require('express');
const { createMondayItem } = require('./monday');

// ——— Initialize Bolt in Socket Mode ———
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
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
    text: '📝 What’s the **Subject** for your KB request?',
  });
});

// ——— DM listener: step‑by‑step Q&A, including attachments and CTA button ———
app.event('message', async ({ event, client }) => {
  // ignore non‑DMs and bot messages
  if (event.channel_type !== 'im' || event.bot_id) return;

  const user = event.user;
  const session = sessions[user];
  if (!session) return; // ignore DMs you didn’t initiate

  try {
    const text = (event.text || '').trim();
    const files = event.files || [];

    switch (session.step) {
      case 1:
        session.data.subject = text;
        session.step = 2;
        return client.chat.postMessage({
          channel: event.channel,
          text: '🛠️ What’s the **Task Type**?',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '🛠️ What’s the **Task Type**?',
              },
              accessory: {
                type: 'static_select',
                action_id: 'task_type_select',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select a task type'
                },
                options: [
                  {
                    text: { type: 'plain_text', text: 'New Feature' },
                    value: 'New Feature'
                  },
                  {
                    text: { type: 'plain_text', text: 'Content Update' },
                    value: 'Content Update'
                  },
                  {
                    text: { type: 'plain_text', text: 'Feature Request' },
                    value: 'Feature Request'
                  },
                  {
                    text: { type: 'plain_text', text: 'Content Flag' },
                    value: 'Content Flag'
                  },
                  {
                    text: { type: 'plain_text', text: 'Content Edit' },
                    value: 'Content Edit'
                  }
                ]
              }
            }
          ]
        });

      case 2:
        // If user selected from dropdown, it will come as an action, but for now accept text
        session.data.taskType = text;
        session.step = 3;
        return client.chat.postMessage({
          channel: event.channel,
          text: '📦 Which **Product** is this for?',
        });

      case 3:
        session.data.product = text;
        session.step = 4;
        return client.chat.postMessage({
          channel: event.channel,
          text: '✅ Great. Please provide a detailed **Description** of the upcoming changes.',
        });

      case 4:
        session.data.description = text;
        session.step = 5;
        return client.chat.postMessage({
          channel: event.channel,
          text: '📎 If you have **screenshots or files**, upload them now. When you’re ready, click the button below.',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '📎 If you have **screenshots or files**, upload them now. When you’re ready, click the button below.'
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Submit KB Request'
                  },
                  action_id: 'submit_kb_request'
                }
              ]
            }
          ]
        });

      // Accept file uploads in step 5 before submission
      case 5:
        if (files.length) {
          session.data.files = session.data.files || [];
          for (const f of files) session.data.files.push(f.id);
          return client.chat.postMessage({
            channel: event.channel,
            text: `🖼️ Captured ${files.length} file(s). Upload more or click *Submit KB Request* button.`,
          });
        }
        return; // Wait for button click, do not submit on text
    }
  } catch (err) {
    await client.chat.postMessage({
      channel: event.channel,
      text: `⚠️ An error occurred: ${err.message || 'Unknown error.'}`,
    });
    console.error('Error in DM Q&A handler:', err);
  }
});

// ——— Handle Task Type select (dropdown) ———
app.action('task_type_select', async ({ ack, body, client, action }) => {
  await ack();
  const user = body.user.id;
  const session = sessions[user];
  if (!session || session.step !== 2) return;

  session.data.taskType = action.selected_option.value;
  session.step = 3;
  await client.chat.postMessage({
    channel: body.channel.id,
    text: '📦 Which **Product** is this for?',
  });
});

// ——— Handle Submit button and show modal with CTA ———
app.action('submit_kb_request', async ({ ack, body, client }) => {
  await ack();
  const user = body.user.id;
  const session = sessions[user];
  if (!session || session.step !== 5) return;

  // Create item in Monday.com
  const itemId = await createMondayItem({ ...session.data, user });
  const mondayBoardUrl = `https://your-monday-board-url/${itemId}`; // Replace with actual Monday.com item URL logic

  // Show modal with CTA
  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      title: { type: 'plain_text', text: 'KB Request Submitted' },
      close: { type: 'plain_text', text: 'Close' },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🎉 Your KB request has been submitted to the Monday.com board!'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View on Monday.com' },
              url: mondayBoardUrl
            }
          ]
        }
      ]
    }
  });

  // Optionally send a DM confirmation as well
  await client.chat.postMessage({
    channel: body.channel.id,
    text: '🎉 Your KB request has been submitted to the Monday.com board!'
  });

  delete sessions[user];
});

// ——— Express health check server ———
const server = express();
server.get('/', (req, res) => res.send('KB Request Bot is running'));
server.listen(process.env.PORT || 3000, () => {
  console.log(`🔗 HTTP server listening on port ${process.env.PORT || 3000}`);
});

// ——— Start the app ———
(async () => {
  await app.start();
  console.log('⚡️ KB Request Bot running in Socket Mode');
})();
