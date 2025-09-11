import OpenAI from 'openai';
import dotenv from "dotenv"
dotenv.config()

// Initialize OpenAI client
const openai = new OpenAI({
  baseURL: "https://models.github.ai/inference",
  apiKey: process.env.GITHUB_AI_TOKEN
});


// Function to generate AI analysis using OpenAI
async function generateAIAnalysis(sheetsData) {
  try {
    console.log('---Generating AI analysis---');
    
    // Create a prompt based on the sheets data

    //`Summarize and Analyze this data from Google Sheets. Provide all links for images and Sources. Make sure any markdown used is formated for a message that a slack bot would send (Change bold to bold Change italic to italic Change [link text](url) to <url|link text>):\n\n`
    let prompt = `Analyze these FRC Open Alliance forum posts and team updates for strategic scouting intelligence.

**Open Alliance Context:**
You're reviewing Summaries of Chief Delphi Open Alliance threads where teams share:
- Robot reveals and technical specifications
- Build season updates and design decisions  
- Competition performance and lessons learned
- Strategy discussions and game analysis

**Intelligence Gathering Priorities:**
1. *Robot Capabilities* - What can each robot actually do?
2. *Design Innovations* - Unique mechanisms or strategies
3. *Team Confidence* - Are they satisfied with their robot?
4. *Known Issues* - Reliability problems or design flaws mentioned
5. *Strategy Reveals* - Auto routines, teleop priorities, endgame plans

**Format for Team Strategy Channel:**
- Use *bold* for team tiers and key findings
- Use _italic_ for team numbers and emphasis
- Keep robot descriptions concise but technical
- Include confidence levels (High/Medium/Low) for assessments
- Include all links provided
- Maximum 450 words for Slack readability:\n\n`;
    
    if (sheetsData) {
      prompt += `Total responses: ${sheetsData.totalResponses}\n`;
      prompt += `Data columns: ${sheetsData.headers.join(', ')}\n\n`;
      prompt += "Recent entries:\n";
      
      sheetsData.recentEntries.forEach((entry, index) => {
        prompt += `Entry ${index + 1}:\n`;
        Object.entries(entry).forEach(([key, value]) => {
          if (value) prompt += `  ${key}: ${value}\n`;
        });
        prompt += "\n";

      });
      
      prompt += "Please provide a brief analysis of trends, patterns, or insights from this data. Keep it concise and actionable for a First Robotics Team.";
    } else {
      prompt = "The data source is currently unavailable. Please provide a motivational message for a team's daily standup, focusing on Lebron James the Goat of basketball.";
    }

    const response = await openai.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "You are a data analyst providing daily insights for a First Robotics Team. Be concise, professional." 
        },
        { role: "user", content: prompt }
      ],
      model: "openai/gpt-4o",
      temperature: 0.7,
      max_tokens: 300,
      top_p: 1
    });

    const analysis = response.choices[0].message.content;
    console.log('---AI analysis generated successfully---');
    
    return {
      analysis: analysis,
      model: "GPT-4o",
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('***Error generating AI analysis:', error.message);
    return {
      analysis: "AI analysis is temporarily unavailable. However, based on your recent data activity, keep up the great work with data collection and analysis!",
      model: "Fallback",
      generatedAt: new Date().toISOString(),
      error: true
    };
  }
}
module.exports = {generateAIAnalysis};