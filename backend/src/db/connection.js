import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '19012004', 
  database: 'boscochat'
});

export default pool;