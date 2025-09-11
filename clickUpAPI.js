import dotenv from "dotenv"
import { readFile,writeFile } from 'node:fs/promises';

dotenv.config()


const url = "https://api.clickup.com/api/v2/team/9011117189/task";
const options = {
                method: 'GET', 
                headers: {
                    accept: 'application/json',
                    Authorization: process.env.CLICKUP_API_KEY
                        
                }};


function cacheClickUpData() {
    fetch(url, options)
    .then(res => res.json())
    .then(json => {
        console.log('Data saved');
        writeFile('./temp.json', JSON.stringify(json, null, 2));
        })
    .catch(err => console.error(err)); 
}

const data = await readFile('./temp.json', 'utf8');
const json = JSON.parse(data);

console.log(json);


//cacheClickUpData()