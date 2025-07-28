// slack.js
require('dotenv').config();

const { App } = require('@slack/bolt');
const { createMondayItem } = require('./monday');

// ——— ExpressReceiver for HTTP delivery ———
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // if you want a custom endpoint instead of /slack/events:
  // endpoints: '/slack/events'
});

// ——— Initialize your Bolt App with that receiver ———
const app = new App({
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN, // xapp-...
  socketMode: true,
});

// ——— Modal builder (reusable) ———
function buildModal(command = '/kb-request') {
  return {
    type: 'modal',
    callback_id: command === '/kb-request' ? 'kb_request_modal' : 'kb_flag_modal',
    title: { type: 'plain_text', text: '/kb-request' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'article_link',
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          placeholder: { type: 'plain_text', text: 'https://support.wix.com/en/article/…' },
        },
        label: { type: 'plain_text', text: 'Article Link (if applicable)' },
      },
      {
        type: 'input',
        block_id: 'request_type',
        element: {
          type: 'static_select',
          action_id: 'value',
          options: [
            { text: { type: 'plain_text', text: 'New Feature' }, value: 'New Feature' },
            { text: { type: 'plain_text', text: 'Content Update' }, value: 'Content Update' },
            { text: { type: 'plain_text', text: 'Feature Request' }, value: 'Feature Request' },
            { text: { type: 'plain_text', text: 'Content Flag' }, value: 'Content Flag' },
          ],
        },
        label: { type: 'plain_text', text: 'Request Type' },
      },
      {
        type: 'input',
        block_id: 'description',
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          multiline: true,
        },
        label: { type: 'plain_text', text: 'Description' },
      },
    ],
  };
}

// ——— Slash command handler ———
app.command('/kb-request', async ({ ack, command, client }) => {
  await ack();
  // Open a DM with the user
  const { channel } = await client.conversations.open({ users: command.user_id });
  // Ask first question
  await client.chat.postMessage({
    channel,
    text: '📝 Let’s get started. What’s the **Subject** for your KB request?',
  });
});

// ——— Message shortcut with prefill ———
app.shortcut('kb_request_message', async ({ shortcut, ack, client }) => {
  await ack();
  const messageText = shortcut.message?.text || '';
  const modal = buildModal('kb_request_message');
  modal.blocks = modal.blocks.map((block) => {
    if (block.block_id === 'description' && messageText) {
      block.element.initial_value = messageText;
    }
    return block;
  });

  await client.views.open({
    trigger_id: shortcut.trigger_id,
    view: modal,
  });
});

// ——— Modal submission handler ———
app.view(/kb_request_modal|kb_flag_modal/, async ({ ack, view, body, client }) => {
  await ack();
  const vals = view.state.values;
  const payload = {
    articleLink: vals.article_link.value.value,
    requestType: vals.request_type.value.selected_option.value,
    description: vals.description.value.value,
    user: body.user.username || body.user.name || body.user.id,
  };

  await createMondayItem(payload);

  await client.chat.postMessage({
    channel: body.user.id,
    text: '✅ Your KB request has been submitted to the team. Thank you!',
  });
});

// ——— Start your app ———
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ KB Request Bot running via ExpressReceiver on port', process.env.PORT || 3000);
})();
