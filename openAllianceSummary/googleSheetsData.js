import axios from 'axios';
import dotenv from "dotenv"
dotenv.config()


async function getGoogleSheetsData() {
  try {
    console.log('---Fetching Google Sheets data---');
    const sheetId = process.env.SHEET_ID;
    const range = 'FormResponses!A:F'; // Adjust to your desired range
    const apiKey = process.env.SHEET_API_KEY;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
    const response = await axios.get(url);
    const data = response.data;

    if (data.values) {
      console.log('---Google Sheets data retrieved successfully!!!---');
      
      // Process the sheet data
      const headers = data.values[0]; // First row as headers
      const rows = data.values.slice(1); // Rest as data rows

      // Get today's date in the format used by your sheet: M/D/YYYY
      const today = new Date();
      const todayDateString = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
      
      console.log(`Looking for today's date: ${todayDateString}`);

      // Assuming first column (index 0) contains the timestamp
      // Format: "7/24/2025 20:39:43"
      const dateColumnIndex = 0;

      // Filter rows to only include today's responses
      const todaysRows = rows.filter(row => {
        if (!row[dateColumnIndex]) return false;
        
        const cellValue = row[dateColumnIndex].toString();
        // Extract just the date part (before the space and time)
        const cellDatePart = cellValue.split(' ')[0]; // Gets "7/24/2025" from "7/24/2025 20:39:43"
        
        // Check if the date matches today
        return cellDatePart === todayDateString;
      });

      console.log(`Found ${todaysRows.length} responses from today (${todayDateString}) out of ${rows.length} total responses`);

      // Convert today's rows to entry objects
      const todaysEntries = todaysRows.map(row => {
        const entry = {};
        headers.forEach((header, index) => {
          entry[header] = row[index] || '';
        });
        return entry;
      });

      // If no entries today, return empty structure
      if (todaysEntries.length === 0) {
        console.log('---No responses found for today---');
        return {
          totalResponses: rows.length,
          todaysResponses: 0,
          todaysEntries: [],
          headers: headers,
          recentEntries: [],
          lastUpdated: new Date().toISOString(),
          searchDate: todayDateString
        };
      }

      // Sort today's entries by time (most recent first)
      todaysEntries.sort((a, b) => {
        const timeA = a[headers[dateColumnIndex]];
        const timeB = b[headers[dateColumnIndex]];
        return new Date(`${timeB}`) - new Date(`${timeA}`);
      });

      return {
        totalResponses: rows.length, // Total responses ever
        todaysResponses: todaysEntries.length, // Count of today's responses
        todaysEntries: todaysEntries, // All entries from today
        headers: headers,
        recentEntries: todaysEntries.slice(0, 5), // Most recent 5 from today
        lastUpdated: new Date().toISOString(),
        searchDate: todayDateString
      };

    } else {
      console.error('---No values returned from Google Sheets---');
      return null;
    }
  } catch (error) {
    console.error('***Error fetching Google Sheets data:', error.message);
    return null;
  }
}

module.exports = {getGoogleSheetsData};