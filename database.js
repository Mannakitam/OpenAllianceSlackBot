import mysql from "mysql2"
import dotenv from "dotenv"
dotenv.config()

const dbConfig = {
    host           : process.env.DATABASE_HOST,
    database       : process.env.DATABASE,
    user           : process.env.DB_USER,
    password       : process.env.DB_PASS,
    connectTimeout : 1 * 60 * 1000,
}

let pool = mysql.createPool(dbConfig).promise()

pool.getConnection((err, connection) => {
  if (err) {
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      console.error('Database connection was closed.')
    }
    if (err.code === 'ER_CON_COUNT_ERROR') {
      console.error('Database has too many connections.')
    }
    if (err.code === 'ECONNREFUSED') {
      console.error(err)
      console.error('Database connection was refused.')
    }
  }

  if (connection){
    console.log("connection id: " + connection.threadId)
    connection.release()
    return
  }
})

async function addData(id, ts, dt) {
    await pool.query(`
    INSERT INTO meetings (channelID, ts, date)
    VALUES (?, ?, ?)    
    `, [id, ts, sqlDate(dt)])   
}

function sqlDate(dateStr) {
  // expects "MM/DD/YYYY"
  const [month, day, year] = dateStr.split('/');

  // pad with zeros if needed
  const mm = month.padStart(2, '0');
  const dd = day.padStart(2, '0');

  return `${year}-${mm}-${dd}`;
}


export default pool