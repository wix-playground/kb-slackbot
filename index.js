// index.js
const express = require("express");
const bodyParser = require("body-parser");
const { handleSlashCommand, handleInteraction } = require("./slack");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post("/slack/events", async (req, res) => {
  const payload = req.body;

  if (payload.command === "/kb-request" || payload.command === "/kb-flag") {
    await handleSlashCommand(payload);
    return res.status(200).send();
  }

  if (payload.payload) {
    const interaction = JSON.parse(payload.payload);
    await handleInteraction(interaction);
    return res.status(200).send();
  }

  res.status(200).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KB Slackbot running on port ${PORT}`);
});
