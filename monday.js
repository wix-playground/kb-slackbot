const axios = require('axios');
const FormData = require('form-data');

const MONDAY_API_URL    = 'https://api.monday.com/v2';
const MONDAY_API_TOKEN  = process.env.MONDAY_API_TOKEN;
const MONDAY_BOARD_ID   = process.env.MONDAY_BOARD_ID;
const SLACK_BOT_TOKEN   = process.env.SLACK_BOT_TOKEN;

const columnMapping = {
  articleLink:  'link',       // Link to Article
  requestType:  'status_1',   // Task Type
  description:  'long_text',  // Description
  attachments:  'files',      // File(s) [optional]
  requestor:    'person'      // Creator
};

const escapeQuotes = str => (str ? str.replace(/"/g, '\\"') : '');

const createMondayItem = async ({ articleLink, requestType, description, user, files = [] }) => {
  const columnValues = {
    [columnMapping.articleLink]:  { url: articleLink, text: 'KB Article' },
    [columnMapping.requestType]:  { label: requestType },
    [columnMapping.description]:  description
  };

  const createQuery = `
    mutation ($boardId: Int!, $columnVals: JSON!) {
      create_item(
        board_id: $boardId,
        item_name: "KB Request from ${escapeQuotes(user)}",
        column_values: $columnVals
      ) { id }
    }
  `;
  const createRes = await axios.post(MONDAY_API_URL,
    {
      query: createQuery,
      variables: {
        boardId: MONDAY_BOARD_ID,
        columnVals: columnValues
      }
    },
    { headers: { Authorization: MONDAY_API_TOKEN } }
  );
  const itemId = createRes.data.data.create_item.id;

  // Attach each Slack file
  for (const slackFileId of files) {
    try {
      const fileInfoRes = await axios.get(
        `https://slack.com/api/files.info?file=${slackFileId}`,
        { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
      );
      if (!fileInfoRes.data.ok) continue;

      const downloadUrl = fileInfoRes.data.file.url_private_download;
      const filename = fileInfoRes.data.file.name;

      const fileDownloadRes = await axios.get(downloadUrl, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        responseType: 'arraybuffer'
      });

      const form = new FormData();
      form.append('query', `
        mutation ($file: File!, $itemId: Int!, $columnId: String!) {
          add_file_to_column (file: $file, item_id: $itemId, column_id: $columnId) { id }
        }
      `);
      form.append('variables[itemId]', itemId);
      form.append('variables[columnId]', columnMapping.attachments);
      form.append('variables[file]', fileDownloadRes.data, filename);

      await axios.post(MONDAY_API_URL, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: MONDAY_API_TOKEN
        }
      });
    } catch (err) {
      console.error(`Failed to attach file ${slackFileId}:`, err.message);
    }
  }

  // ✅ Final return: full board + pulse link
  const boardUrl = `https://wix.monday.com/boards/${MONDAY_BOARD_ID}/pulses/${itemId}`;
  return boardUrl;
};

module.exports = { createMondayItem };
