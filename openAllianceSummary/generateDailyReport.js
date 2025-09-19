import pkg from '@slack/bolt';
const { App } = pkg;

import cron from 'node-cron';
import axios from 'axios';
import OpenAI from 'openai';
import { getGoogleSheetsData } from './googleSheetsData.js';
import { generateAIAnalysis } from './aiAnalysis.js';
import dotenv from "dotenv"
dotenv.config()



// Main function that makes both API calls and processes data
export async function generateDailyReport() {
  try {
    console.log('---Starting daily report generation---');

    // API Call 1: Get Google Sheets data
    const sheetsData = await getGoogleSheetsData();
    
    // API Call 2: Generate AI analysis based on sheets data
    const aiAnalysis = await generateAIAnalysis(sheetsData);

    // Combine both API results
    const report = {
      timestamp: new Date().toLocaleString(),
      sheetsData: sheetsData,
      aiAnalysis: aiAnalysis,
      status: 'success'
    };

    console.log('---Daily report data collected successfully---');
    return report;

  } catch (error) {
    console.error('***Error generating daily report:', error.message);
    
    return {
      timestamp: new Date().toLocaleString(),
      status: 'error',
      message: 'Unable to generate full report, but the bot is working!'
    };
  }
}