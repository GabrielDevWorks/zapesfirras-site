const mysql = require('mysql2');
require('dotenv').config(); 

// db.js

// db.js
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    timezone: 'America/Sao_Paulo' // CORREÇÃO: 'timezone' tudo minúsculo
}).promise();

module.exports = pool;