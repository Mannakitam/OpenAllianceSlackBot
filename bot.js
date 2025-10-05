import pkg from '@slack/bolt';
const { App } = pkg;

import cron from 'node-cron';
import axios from 'axios';
import OpenAI from 'openai';

import fs from "fs";

import { generateDailyReport } from './openAllianceSummary/generateDailyReport.js'
import dotenv from "dotenv"
dotenv.config()

const MEETINGS_FILE = "./meetings.json";

// Initialize your app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Configuration - Replace with your actual channel ID
const DAILY_REPORT_CHANNEL = process.env.SLACK_DAILY_REPORT_CHANNEL; // Replace with your channel ID


// Function to format and send the daily report
async function sendDailyReport() {
  try {
    const reportData = await generateDailyReport();
    
    if (reportData.status === 'error') {
      // Send error message
      await app.client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel: DAILY_REPORT_CHANNEL,
        text: '⚠️ Daily Report - Service Issue',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚠️ Daily Report - Service Issue'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Time:* ${reportData.timestamp}\n*Status:* ${reportData.message}`
            }
          }
        ]
      });
      return;
    }

    // Create rich formatted message with both API results
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Daily Data Report - 9:30 PM Update'
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `📅 Generated on ${reportData.timestamp}`
          }
        ]
      },
      {
        type: 'divider'
      }
    ];


    // Add AI Analysis section
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🤖 *AI Analysis (${reportData.aiAnalysis.model})*\n${reportData.aiAnalysis.analysis}`
      }
    });



    // Add footer
    blocks.push(
      {
        type: 'divider'
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Automated report Generated every day at 9:30 PM'
          }
        ]
      }
    );



    // Send the formatted message
    await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: DAILY_REPORT_CHANNEL,
      text: '📊 Daily Data Report - 9:30 PM Update',
      blocks: blocks
    });

    console.log('✅ Daily report sent successfully to Slack');

  } catch (error) {
    console.error('❌ Error sending daily report:', error);
    
    // Send fallback message
    await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: DAILY_REPORT_CHANNEL,
      text: '⚠️ Daily report failed to send. Please check the bot logs.'
    });
  }
}

// Schedule the daily report at 9:30 PM
cron.schedule('28 20 * * *', async () => {
  console.log('🕘 9:30 PM - Triggering daily report...');
  await sendDailyReport();
}, {
  timezone: "America/New_York" // Change to your timezone
});

// Start the app
(async () => {
  try {
    await app.start();
    console.log('⚡️ Google Sheets + AI Report Bot is running!');
    console.log(`📊 Daily reports will be sent to channel: ${DAILY_REPORT_CHANNEL}`);
    
    // Send startup notification
    await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: DAILY_REPORT_CHANNEL,
      text: 'Data Analysis Bot is now online!'
    });
    
  } catch (error) {
    console.error('❌ Error starting the bot:', error);
  }
})();


// Utility: load JSON
function loadMeetings() {
  if (!fs.existsSync(MEETINGS_FILE)) return {};
  const data = fs.readFileSync(MEETINGS_FILE);
  return JSON.parse(data);
}

// Utility: save JSON
function saveMeetings(meetings) {
  fs.writeFileSync(MEETINGS_FILE, JSON.stringify(meetings, null, 2));
}


/*---------------------------BOT COMMANDS---------------------------*/

//Command to create poll
app.command("/testreport", async ({ command, ack, client }) => {
  await ack();

  const dateInput = command.text.trim();
  const channelId = command.channel_id;

  try {

    //try to join channel if not in (so you dont have to invite every time)
    try {
      await client.conversations.join({ channel: channelId });
      console.log(`Joined channel ${channelId}`);
    } catch (joinError) {
      if (joinError.data?.error !== "method_not_supported_for_channel_type") {
        console.warn(`Could not auto-join channel ${channelId}:`, joinError.data?.error);
      }
    }


    // 1. Post poll message
    const result = await client.chat.postMessage({
      channel: channelId,
      text: `Who is going to the meeting on *${dateInput}*? React with ✅ or ❌`,
    });

    // 2. Add reactions
    await client.reactions.add({ channel: result.channel, timestamp: result.ts, name: "white_check_mark" });
    await client.reactions.add({ channel: result.channel, timestamp: result.ts, name: "x" });

    // 3. Save poll to JSON
    const meetings = loadMeetings();
    if (!meetings[channelId]) meetings[channelId] = [];
    
    meetings[channelId].push({
      ts: result.ts,
      date: dateInput,
    });
    saveMeetings(meetings);


    await client.chat.postEphemeral({
      channel: channelId,
      user: command.user_id,
      text: `Meeting poll created and saved for *${dateInput}*`,
    });

  } catch (error) {
    console.error("Error posting testreport:", error);
  }
});


app.command("/getreport", async ({ command, ack, client }) => {
  await ack();

  const dateInput = command.text.trim();
  const channelId = command.channel_id;

  try {
    const meetings = loadMeetings();
    const channelMeetings = meetings[channelId] || [];

    // 📝 No date provided → show available poll dates
    if (!dateInput) {
      if (channelMeetings.length === 0) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: command.user_id,
          text: `There are no meeting polls saved in this channel.`,
        });
        return;
      }

      const datesList = channelMeetings.map(m => `• ${m.date}`).join("\n");

      await client.chat.postEphemeral({
        channel: channelId,
        user: command.user_id,
        text: `*Available meeting reports in this channel:*\n${datesList}\n\nRun \`/getreport <date>\` to view one.`,
      });

      return;
    }

    // 📊 Date provided → find that poll
    const meeting = channelMeetings.find(m => m.date === dateInput);
    if (!meeting) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: command.user_id,
        text: `❌ No meeting poll found for *${dateInput}* in this channel.`,
      });
      return;
    }

    const auth = await client.auth.test();
    const botUserId = auth.user_id;

    const response = await client.reactions.get({
      channel: channelId,
      timestamp: meeting.ts,
    });

    const reactions = response.message.reactions || [];
    const yesReaction = reactions.find(r => r.name === "white_check_mark");
    const noReaction = reactions.find(r => r.name === "x");

    const yesUsers = yesReaction
      ? yesReaction.users.filter(u => u !== botUserId).map(u => `<@${u}>`)
      : [];

    const noUsers = noReaction
      ? noReaction.users.filter(u => u !== botUserId).map(u => `<@${u}>`)
      : [];

    client.chat.postEphemeral({
        channel: channelId,
        user: command.user_id,
      text: `*Meeting Report for ${meeting.date}*\n✅ Coming: ${yesUsers.length ? yesUsers.join(", ") : "None"}\n❌ Not coming: ${noUsers.length ? noUsers.join(", ") : "None"}`,
    });

  } catch (error) {
    console.error("Error getting report:", error);
  }
});
