import pkg from '@slack/bolt';
const { App } = pkg;

import cron from 'node-cron';
import axios from 'axios';
import OpenAI from 'openai';

import { generateDailyReport } from './openAllianceSummary/generateDailyReport.js'
import dotenv from "dotenv"
dotenv.config()

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
      text: '🤖 Data Analysis Bot is now online!'
    });
    
  } catch (error) {
    console.error('❌ Error starting the bot:', error);
  }
})();