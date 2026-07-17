/**
 * Database adapter — uses SQLite for local development, MySQL for production.
 * Provides a mysql2-compatible interface (pool.execute returns [rows, fields]).
 */
require('dotenv').config();

const USE_SQLITE = process.env.DB_MODE === 'sqlite' || process.env.DB_HOST === 'mysql9.serv00.com';

let db;

if (USE_SQLITE) {
  const Database = require('better-sqlite3');
  const path = require('path');
  const dbPath = path.join(__dirname, '../../data/campus.db');
  const fs = require('fs');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath, { timeout: 10000 });
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  console.log('✅ SQLite connected (local dev mode)');

  // Helper to translate MySQL queries to SQLite compatible dialect
  const translate = (query, params = []) => {
    let q = query
      .replace(/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4/gi, '')
      .replace(/AUTO_INCREMENT/gi, 'AUTOINCREMENT')
      .replace(/INT AUTO_INCREMENT/gi, 'INTEGER')
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/TINYINT\(1\)/gi, 'INTEGER')
      .replace(/VARCHAR\(\d+\)/gi, 'TEXT')
      .replace(/DECIMAL\(\d+,\d+\)/gi, 'REAL')
      .replace(/ENUM\([^)]+\)/gi, 'TEXT')
      .replace(/TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/gi, 'TEXT DEFAULT CURRENT_TIMESTAMP')
      .replace(/TIMESTAMP DEFAULT CURRENT_TIMESTAMP/gi, 'TEXT DEFAULT CURRENT_TIMESTAMP')
      .replace(/TIMESTAMP NOT NULL/gi, 'TEXT NOT NULL')
      .replace(/TIMESTAMP NULL/gi, 'TEXT')
      .replace(/TIMESTAMP/gi, 'TEXT')
      .replace(/JSON DEFAULT NULL/gi, 'TEXT DEFAULT NULL')
      .replace(/\bJSON\b(?!\s*(_|OBJECT|ARRAYAGG))/gi, 'TEXT')
      .replace(/CURRENT_TEXT/gi, 'CURRENT_TIMESTAMP')
      .replace(/JSON_ARRAYAGG/gi, 'json_group_array')
      .replace(/INDEX\s+\w+\s*\([^)]+\),?/gi, '')
      .replace(/,\s*\)/g, ')')
      .replace(/DATE_SUB\(NOW\(\),\s*INTERVAL\s+(\d+)\s+DAY\)/gi, "datetime('now', '-$1 days')")
      .replace(/NOW\(\)/gi, "datetime('now')")
      .replace(/DATE\((\w+)\)/gi, "date($1)")
      .replace(/COALESCE/gi, 'COALESCE')
      .replace(/LIMIT\s+\?\s+OFFSET\s+\?/gi, 'LIMIT ? OFFSET ?')
      .replace(/\bFOR UPDATE\b/gi, '');

    const sqliteParams = params.map(p => {
      if (p === true) return 1;
      if (p === false) return 0;
      if (p === null || p === undefined) return null;
      if (p instanceof Date) return p.toISOString().replace('T', ' ').substring(0, 19);
      return p;
    });

    return { q, sqliteParams };
  };

  // Wrap SQLite to match mysql2 pool.execute(query, params) -> [rows]
  db = {
    execute: async (query, params = []) => {
      const { q, sqliteParams } = translate(query, params);
      const trimmed = q.trim();

      try {
        if (trimmed.toUpperCase().startsWith('SELECT') || trimmed.toUpperCase().startsWith('WITH')) {
          const rows = sqlite.prepare(trimmed).all(...sqliteParams);
          return [rows, []];
        } else if (trimmed.toUpperCase().startsWith('INSERT') || trimmed.toUpperCase().startsWith('REPLACE')) {
          const info = sqlite.prepare(trimmed).run(...sqliteParams);
          return [{ insertId: info.lastInsertRowid, affectedRows: info.changes }, []];
        } else {
          const info = sqlite.prepare(trimmed).run(...sqliteParams);
          return [{ affectedRows: info.changes }, []];
        }
      } catch (err) {
        // Silently handle some CREATE TABLE issues
        if (err.message.includes('already exists') || err.message.includes('duplicate column')) {
          return [[], []];
        }
        throw err;
      }
    },
    getConnection: async () => {
      const connDb = new Database(dbPath, { timeout: 10000 });
      connDb.pragma('journal_mode = WAL');
      connDb.pragma('foreign_keys = ON');

      return {
        execute: async (query, params = []) => {
          const { q, sqliteParams } = translate(query, params);
          const trimmed = q.trim();
          try {
            if (trimmed.toUpperCase().startsWith('SELECT') || trimmed.toUpperCase().startsWith('WITH')) {
              const rows = connDb.prepare(trimmed).all(...sqliteParams);
              return [rows, []];
            } else if (trimmed.toUpperCase().startsWith('INSERT') || trimmed.toUpperCase().startsWith('REPLACE')) {
              const info = connDb.prepare(trimmed).run(...sqliteParams);
              return [{ insertId: info.lastInsertRowid, affectedRows: info.changes }, []];
            } else {
              const info = connDb.prepare(trimmed).run(...sqliteParams);
              return [{ affectedRows: info.changes }, []];
            }
          } catch (err) {
            if (err.message.includes('already exists') || err.message.includes('duplicate column')) {
              return [[], []];
            }
            throw err;
          }
        },
        beginTransaction: async () => {
          connDb.prepare('BEGIN IMMEDIATE').run();
        },
        commit: async () => {
          connDb.prepare('COMMIT').run();
        },
        rollback: async () => {
          if (connDb.inTransaction) {
            connDb.prepare('ROLLBACK').run();
          }
        },
        release: () => {
          try {
            connDb.close();
          } catch (e) {
            // Ignore already closed
          }
        }
      };
    },
    transaction: async (callback) => {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const result = await callback(conn);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
  };
} else {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    ssl: {
      rejectUnauthorized: false
    }
  });

  db = Object.assign(Object.create(pool), {
    execute: async (query, params) => {
      try {
        return await pool.execute(query, params);
      } catch (err) {
        if (err.message.includes('Incorrect arguments to mysqld_stmt_execute') || (typeof query === 'string' && query.toUpperCase().includes('LIMIT'))) {
          return await pool.query(query, params);
        }
        throw err;
      }
    },
    query: async (query, params) => {
      return await pool.query(query, params);
    },
    getConnection: async () => {
      const conn = await pool.getConnection();
      const origExecute = conn.execute;
      const origQuery = conn.query;
      conn.execute = async (query, params) => {
        try {
          return await origExecute.call(conn, query, params);
        } catch (err) {
          if (err.message.includes('Incorrect arguments to mysqld_stmt_execute') || (typeof query === 'string' && query.toUpperCase().includes('LIMIT'))) {
            return await origQuery.call(conn, query, params);
          }
          throw err;
        }
      };
      return conn;
    },
    transaction: async (callback) => {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const result = await callback(conn);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
  });

  pool.getConnection()
    .then(conn => { console.log('✅ MySQL connected'); conn.release(); })
    .catch(err => console.error('❌ MySQL failed:', err.message));
}

module.exports = db;
