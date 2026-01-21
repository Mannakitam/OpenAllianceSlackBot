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

export async function saveMessage(channelID, userID, text, ts, thread_ts, edited_ts, attachments){
    await pool.query (`
        INSERT INTO messageHistory (channel, user, text, ts, thread_ts, edited_ts, attachments)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, 
        [channelID, userID, text, ts, thread_ts, edited_ts, attachments]
    )
}

export async function updateMessage(text, edited_ts, attachments, thread_ts, ts, channelID, user){
    await pool.query(`
        UPDATE messageHistory
        SET text = ?, edited_ts = ?, attachments = ?, thread_ts = ?, user = ?
        WHERE ts = ? AND channel = ?`,
        [text, edited_ts, attachments, thread_ts, user, ts, channelID]
    );
}

export async function addMeeting(id, ts, dt) {
    await pool.query(`
        INSERT INTO meetings (channelID, ts, date)
        VALUES (?, ?, ?)    
        `, [id, ts, dt])   
}


export async function getMeeting(id, ts, dt) {
    const hi = await pool.query(`
        SELECT date FROM meetings WHERE channelID = (?)
        `, [id])
    return hi[0]
}

export async function getMeetingWithTS(id) {
    const hi = await pool.query(`
        SELECT date, ts FROM meetings WHERE channelID = (?)
        `, [id])
    return hi[0]
}

function sqlDate(dateStr) {
    // expects "MM/DD/YYYY"
    const [month, day, year] = dateStr.split('/');

    // pad with zeros if needed
    const mm = month.padStart(2, '0');
    const dd = day.padStart(2, '0');

    return `${year}-${mm}-${dd}`;
}

export async function findDuplicateMeeting(channel, date) {
    const meetings = await getMeeting(channel) || [];

    const inputDate = (typeof date === "string" && date.length >= 10)
        ? date.slice(0, 10)
        : new Date(date).toISOString().slice(0, 10);

    for (const m of meetings) {
        if (!m?.date) continue;
        const mDate = (typeof m.date === "string" && m.date.length >= 10)
            ? m.date.slice(0, 10)
            : new Date(m.date).toISOString().slice(0, 10);

        if (mDate === inputDate) {
            console.log("true");
            return true;
        }
    }

    console.log("false");
    return false;
}




export async function runOnce(id, task) {
    const [rows] = await pool.query(
        "SELECT id FROM slack_idempotency WHERE id = ?",
        [id]
    );

    if (rows.length) return;

    await pool.query(
        "INSERT INTO slack_idempotency (id) VALUES (?)",
        [id]
    );

    await task();
}

export async function createRole(id) {
    await pool.query(`
        INSERT INTO role_names (name) VALUES (?)
        `, [id])
}

export async function deleteRole(ID) {
    await pool.query(`
        DELETE FROM role_names WHERE name = (?) 
        `, [ID])
}

export async function getRoles(){
    const hi = await pool.query(`
        SELECT name FROM role_names ORDER BY name
        `)
    return hi[0]
}

export async function addUserToRole(roleId, userId) {
    await pool.query(
        "INSERT INTO user_roles (role_id, user_id) VALUES (?, ?)",
        [roleId, userId]
    );
}

export async function removeUserFromRole(roleId, userId) {
    await pool.query(
        "DELETE FROM user_roles WHERE role_id = ? AND user_id = ?",
        [roleId, userId]
    );
}

export async function getRoleMembers(roleId) {
    const [rows] = await pool.query(
        "SELECT user_id FROM user_roles WHERE role_id = ?",
        [roleId]
    );
    return rows;
}

export async function getRoleByName(roleName) {
    const hi = await pool.query(`
        SELECT name FROM role_names WHERE name = (?)
        `, [roleName])
    return hi.length ? hi[0] : null;
}

export async function getUsersInRole(roleId) {
    const [rows] = await pool.query(
        `
        SELECT user_id
        FROM user_roles
        WHERE role_id = ?
        `,
        [roleId]
    );

    return rows;
}

export async function getUserRoles(id) {
    const hi = await pool.query(`
        SELECT role_id FROM user_roles WHERE user_id = (?)
        `, [id])
    return hi[0]
}