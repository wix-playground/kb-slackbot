// server.js
require("dotenv").config();
const { App } = require("@slack/bolt");
const { createMondayItem } = require("./monday");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

// Slash command handler for /kb-request and /kb-flag
app.command("/kb-request", async ({ ack, body, client }) => {
  await ack();

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      callback_id: "kb_request_modal",
      title: { type: "plain_text", text: "New KB Request" },
      submit: { type: "plain_text", text: "Submit" },
      close: { type: "plain_text", text: "Cancel" },
      blocks: [
        {
          type: "input",
          block_id: "article_link",
          label: { type: "plain_text", text: "Article Link (if applicable)" },
          element: {
            type: "plain_text_input",
            action_id: "value",
            placeholder: { type: "plain_text", text: "https://support.wix.com/en/article/..." }
          }
        },
        {
          type: "input",
          block_id: "request_type",
          label: { type: "plain_text", text: "Request Type" },
          element: {
            type: "static_select",
            action_id: "value",
            options: [
              { text: { type: "plain_text", text: "New Feature" }, value: "New Feature" },
              { text: { type: "plain_text", text: "Content Update" }, value: "Content Update" },
              { text: { type: "plain_text", text: "Feature Request" }, value: "Feature Request" },
              { text: { type: "plain_text", text: "Content Flag" }, value: "Content Flag" }
            ]
          }
        },
        {
          type: "input",
          block_id: "description",
          label: { type: "plain_text", text: "Description" },
          element: {
            type: "plain_text_input",
            action_id: "value",
            multiline: true
          }
        }
      ]
    }
  });
});

app.view("kb_request_modal", async ({ ack, view, body }) => {
  await ack();

  const values = view.state.values;
  const articleLink = values.article_link.value.value;
  const requestType = values.request_type.value.selected_option.value;
  const description = values.description.value.value;
  const user = body.user.name || body.user.username;

  await createMondayItem({ articleLink, requestType, description, user });
});

(async () => {
  await app.start();
  console.log("⚡️ Slack Bolt app is running via Socket Mode");
})();
