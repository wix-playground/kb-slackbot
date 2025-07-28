const { App } = require('@slack/bolt');
const { createMondayItem } = require("./monday");
require("dotenv").config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  port: process.env.PORT || 3000,
});

// Modal builder (reusable)
function buildModal(command = "/kb-request") {
  return {
    type: "modal",
    callback_id: command === "/kb-request" ? "kb_request_modal" : "kb_flag_modal",
    title: { type: "plain_text", text: "/kb-request" },
    submit: { type: "plain_text", text: "Submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "article_link",
        element: {
          type: "plain_text_input",
          action_id: "value",
          placeholder: { type: "plain_text", text: "https://support.wix.com/en/article/..." }
        },
        label: { type: "plain_text", text: "Article Link (if applicable)" }
      },
      {
        type: "input",
        block_id: "request_type",
        element: {
          type: "static_select",
          action_id: "value",
          options: [
            { text: { type: "plain_text", text: "New Feature" }, value: "New Feature" },
            { text: { type: "plain_text", text: "Content Update" }, value: "Content Update" },
            { text: { type: "plain_text", text: "Feature Request" }, value: "Feature Request" },
            { text: { type: "plain_text", text: "Content Flag" }, value: "Content Flag" }
          ]
        },
        label: { type: "plain_text", text: "Request Type" }
      },
      {
        type: "input",
        block_id: "description",
        element: {
          type: "plain_text_input",
          action_id: "value",
          multiline: true
        },
        label: { type: "plain_text", text: "Description" }
      }
    ]
  };
}

// Slash command handler
app.command('/kb-request', async ({ command, ack, client }) => {
  await ack();
  await client.views.open({
    trigger_id: command.trigger_id,
    view: buildModal("/kb-request"),
  });
});

// Message shortcut handler - with prefill
app.shortcut('kb_request_message', async ({ shortcut, ack, client }) => {
  await ack();

  const messageText = shortcut.message?.text || "";

  await client.views.open({
    trigger_id: shortcut.trigger_id,
    view: {
      ...buildModal('kb_request_message'),
      blocks: buildModal('kb_request_message').blocks.map(block => {
        if (block.block_id === "description" && messageText) {
          return {
            ...block,
            element: {
              ...block.element,
              initial_value: messageText
            }
          };
        }
        return block;
      })
    }
  });
});

// Modal submission handler
app.view(/kb_request_modal|kb_flag_modal/, async ({ ack, view, body, client }) => {
  await ack();
  const values = view.state.values;
  const articleLink = values.article_link.value.value;
  const requestType = values.request_type.value.selected_option.value;
  const description = values.description.value.value;
  const user = body.user.username || body.user.name || body.user.id;

  await createMondayItem({ articleLink, requestType, description, user });

  // Confirmation
  await client.chat.postMessage({
    channel: body.user.id,
    text: "✅ Your KB request has been submitted to the team. Thank you!"
  });
});

module.exports = app;
