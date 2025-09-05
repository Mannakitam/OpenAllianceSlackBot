require('dotenv').config();
const fs = require('node:fs/promises');


const url = "https://api.clickup.com/api/v2/team/9011117189/task";
const options = {
                method: 'GET', 
                headers: {
                    accept: 'application/json',
                    Authorization: process.env.CLICKUP_API_KEY
                        
                }};

fetch(url, options)
  .then(res => res.json())
  .then(json => {
    console.log('Data saved');
    fs.writeFile('./temp.json', JSON.stringify(json, null, 2));
    })
  .catch(err => console.error(err)); 