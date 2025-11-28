import sql from 'mssql';

export const sqlConfig = {
  server: "DESKTOP-J44KCUR\\SQLEXPRESS",
  database: "clinixdb",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  authentication: {
    type: 'ntlm',
    options: {
      domain: 'DESKTOP-J44KCUR',          // your Windows domain or leave blank
      userName: 'Mais',
      password: '1234'
    }
  }
};

let pool;

export async function getConnection() {
  try {
    if (pool) {
      console.log('Using existing connection pool');
      return pool;
    }

    console.log('Creating new connection pool to:', sqlConfig.server);
    pool = await sql.connect(sqlConfig);

    const result = await pool.request().query('SELECT @@VERSION as version');
    console.log("✅ Connected to SQL Server:", result.recordset[0].version);

    return pool;
  } catch (err) {
    console.error("❌ SQL Server Connection Failed:", err.message);
    throw err;
  }
}

export { sql };
