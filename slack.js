// slack.js
const axios = require("axios");
const { createMondayItem } = require("./monday");

const openModal = async (trigger_id, command) => {
  const modal = {
    trigger_id,
    view: {
      type: "modal",
      callback_id: command === "/kb-request" ? "kb_request_modal" : "kb_flag_modal",
      title: {
        type: "plain_text",
        text: command === "/kb-request" ? "New KB Request" : "Flag KB Article"
      },
      submit: {
        type: "plain_text",
        text: "Submit"
      },
      close: {
        type: "plain_text",
        text: "Cancel"
      },
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
              {
                text: { type: "plain_text", text: "New Feature" },
                value: "New Feature"
              },
              {
                text: { type: "plain_text", text: "Content Update" },
                value: "Content Update"
              },
              {
                text: { type: "plain_text", text: "Feature Request" },
                value: "Feature Request"
              },
              {
                text: { type: "plain_text", text: "Content Flag" },
                value: "Content Flag"
              }
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
    }
  };

  await axios.post("https://slack.com/api/views.open", modal, {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
};

const handleSlashCommand = async (payload) => {
  await openModal(payload.trigger_id, payload.command);
};

const handleInteraction = async (interaction) => {
  if (interaction.type === "view_submission") {
    const values = interaction.view.state.values;
    const articleLink = values.article_link.value.value;
    const requestType = values.request_type.value.selected_option.value;
    const description = values.description.value.value;

    const user = interaction.user.username || interaction.user.name;
    await createMondayItem({ articleLink, requestType, description, user });
  }
};

module.exports = { handleSlashCommand, handleInteraction };
