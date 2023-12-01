const sql = require('mssql');

async function ssSql(connection, sqlString) {
  try {
    const config = {
      server: connection.host,
      port: connection.port,
      user: connection.username,
      password: connection.password,
      database: connection.database,
      connectionTimeout: 30000,
      requestTimeout: 680000,
      options: { 
        enableArithAbort: true,
        encrypt: false,
      },
      trustServerCertificate: true,
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };
    if (connection.domain) {
      config.domain = connection.domain;
    }

    await sql.connect(config);
    const result = await sql.query(sqlString);
    return JSON.stringify(result).slice(0, 40);
  } catch (err) {
    throw (new Error('SQL Server error' + err));
  }
}

module.exports = ssSql;
