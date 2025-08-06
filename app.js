require('dotenv').config();
const { App } = require('@slack/bolt');
const express = require('express');
const { createMondayItem } = require('./monday');
const { runWorkflow } = require('./handlers/modelhub');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const sessions = {};

app.command('/kb-request', async ({ command, ack, client }) => {
  await ack();
  const { channel } = await client.conversations.open({ users: command.user_id });
  sessions[command.user_id] = { step: 1, data: {} };
  await client.chat.postMessage({
    channel,
    text: '📝 What’s the **Subject** for your KB request?',
  });
});

app.event('message', async ({ event, client }) => {
  if (event.channel_type !== 'im' || event.bot_id) return;

  const user = event.user;
  const session = sessions[user];
  if (!session) return;

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
          blocks: [{
            type: 'section',
            text: { type: 'mrkdwn', text: '🛠️ What’s the **Task Type**?' },
            accessory: {
              type: 'static_select',
              action_id: 'task_type_select',
              placeholder: { type: 'plain_text', text: 'Select a task type' },
              options: [
                { text: { type: 'plain_text', text: 'New Feature' }, value: 'New Feature' },
                { text: { type: 'plain_text', text: 'Content Update' }, value: 'Content Update' },
                { text: { type: 'plain_text', text: 'Feature Request' }, value: 'Feature Request' },
                { text: { type: 'plain_text', text: 'Content Flag' }, value: 'Content Flag' },
                { text: { type: 'plain_text', text: 'Content Edit' }, value: 'Content Edit' },
              ],
            },
          }],
        });

      case 2:
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
          text: '🔗 If you know the KBs you’d like to update, please paste their URLs here. (Optional)',
        });

      case 5:
        session.data.kbUrls = text;
        session.step = 6;
        return client.chat.postMessage({
          channel: event.channel,
          text: '🗂️ Please add any links to supporting materials (Figma files, specs, product decks, etc.), or upload files.',
        });

      case 6:
        if (files.length) {
          session.data.files = session.data.files || [];
          for (const f of files) session.data.files.push(f.id);
          return client.chat.postMessage({
            channel: event.channel,
            text: `🖼️ Captured ${files.length} file(s). Click below to submit.`,
            blocks: [{
              type: 'actions',
              elements: [{
                type: 'button',
                text: { type: 'plain_text', text: 'Submit KB Request' },
                action_id: 'submit_kb_request',
              }],
            }],
          });
        }

        session.data.supportingMaterials = text;
        return client.chat.postMessage({
          channel: event.channel,
          text: 'When you’re ready, click the button below to submit your KB request.',
          blocks: [{
            type: 'actions',
            elements: [{
              type: 'button',
              text: { type: 'plain_text', text: 'Submit KB Request' },
              action_id: 'submit_kb_request',
            }],
          }],
        });
    }
  } catch (err) {
    await client.chat.postMessage({
      channel: event.channel,
      text: `⚠️ Error: ${err.message || 'Unknown error'}`,
    });
    console.error('DM Q&A Error:', err);
  }
});

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

app.action('submit_kb_request', async ({ ack, body, client }) => {
  await ack();
  const user = body.user.id;
  const session = sessions[user];
  if (!session || session.step < 6) return;

  const raw_message = `${session.data.subject}\n${session.data.description}\n${session.data.supportingMaterials || ''}`;
  const workflowOutput = await runWorkflow({
    pm_message: raw_message,
    user_id: user
  });

  console.log('Workflow Output:', workflowOutput);

  const itemId = await createMondayItem({
    ...workflowOutput,
    slack_user: user
  });

  const mondayBoardUrl = `https://wix.monday.com/boards/9610768130/pulses/${itemId}`;

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      title: { type: 'plain_text', text: 'KB Request Submitted' },
      close: { type: 'plain_text', text: 'Close' },
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '🎉 Your KB request has been submitted to the Monday.com board!' }
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

  await client.chat.postMessage({
    channel: body.channel.id,
    text: `✅ Your KB request has been submitted.\n🔗 View it here: ${mondayBoardUrl}`
  });

  delete sessions[user];
});

const server = express();
server.get('/', (req, res) => res.send('KB Request Bot is running'));
server.listen(process.env.PORT || 3000, () => {
  console.log(`🔗 Listening on port ${process.env.PORT || 3000}`);
});

(async () => {
  await app.start();
  console.log('⚡️ Slackbot is running in Socket Mode');
})();
