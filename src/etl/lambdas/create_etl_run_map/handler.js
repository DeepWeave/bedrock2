const { Client } = require('pg')
const getConnection = require('./getConnection')
const awsCronParser = require('aws-cron-parser');
const toposort = require('toposort');
const TIME_INTERVAL = 15; // Frequency - must match Eventbridge scheduler
let debug = false;

function formatRes(code, result) {
  return {
    'statusCode': code,
    'body': result
  }
}

async function getConnectionObject() {
  let connection = Promise.resolve({
    host: process.env.BEDROCK_DB_HOST || 'localhost',
    port: 5432,
    user: process.env.BEDROCK_DB_USER || 'bedrock',
    password: process.env.BEDROCK_DB_PASSWORD || 'test-bedrock',
    database: process.env.BEDROCK_DB_NAME || 'bedrock',
    max: 10,
    idleTimeoutMillis: 10000,
  });

  // If BEDROCK_DB_HOST is not in the environment, assume normal bedrock DB
  if (!('BEDROCK_DB_HOST' in process.env)) {
    return getConnection('nopubrecdb1/bedrock/bedrock_user')
      .then(
        function (cpValue) {
          connection = {
            host: cpValue.host,
            port: cpValue.port,
            user: cpValue.username,
            password: cpValue.password,
            database: cpValue.database,
            max: 10,
            idleTimeoutMillis: 10000,
          }
          return connection;
        }
      )
      .catch(err => { // Just pass it on.
        throw err;
      });
  }
  return connection;
}

const pgErrorCodes = require("./pgErrorCodes")

async function readEtlList(connection, rungroups) {
  let etlList = [];
  if (rungroups.length > 0) {
    const client = new Client(connection);
    await client.connect()
      .catch((err) => {
        let errmsg = pgErrorCodes[err.code]
        throw new Error([`Postgres error: ${errmsg}`, err]);
      });
    let rgString = rungroups.reduce(
      (accumulator, currentValue) => {
        let sep = (accumulator !== '') ? ', ' : ''
        return accumulator + sep + "'" + currentValue + "'"
      }, ''
    );
    let sql = `SELECT * FROM bedrock.etl where run_group in (${rgString}) and active = true;`;
    const res = await client.query(sql)
      .catch(err => {
        let errmsg = pgErrorCodes[err.code]
        throw new Error([`Postgres error: ${errmsg}`, err]);
      });
    etlList = res.rows;
    await client.end();
  }
  let assetMap = {};
  for (index in etlList) {
    const asset = etlList[index];
    assetMap[asset['asset_name']] = {
      'name': asset['asset_name'],
      'run_group': asset['run_group'],
      'depends': [],
      'etl_tasks': [],
    };
  }
  return Promise.resolve(assetMap);
}

async function readDependencies(connection, assetMap) {
  const client = new Client(connection);
  await client.connect()
  for (nm in assetMap) {
    const asset = assetMap[nm];
    let sql = `SELECT * FROM bedrock.dependencies where asset_name = '${nm}';`;
    const res = await client.query(sql)
      .catch(err => {
        let errmsg = pgErrorCodes[err.code]
        throw new Error([`Postgres error: ${errmsg}`, err]);
      }
      );
    for (let i = 0; i < res.rowCount; ++i) {
      const d = res.rows[i];
      asset['depends'].push(d['dependency']);
    }
  }
  await client.end();
  return Promise.resolve(assetMap);
}

async function readTasks(connection, assetMap) {
  const client = new Client(connection);
  await client.connect()
  for (nm in assetMap) {
    const asset = assetMap[nm];
    let sql = `SELECT * FROM bedrock.tasks where asset_name = '${nm}' order by seq_number;`;
    const res = await client.query(sql)
      .catch(err => {
        let errmsg = pgErrorCodes[err.code]
        throw new Error([`Postgres error: ${errmsg}`, err]);
      });
    for (let i = 0; i < res.rowCount; ++i) {
      const task = res.rows[i];
      let thisTask = {
        type: task['type'],
        active: task['active']
      };
      if (task['type'] === 'table_copy' || task['type'] == 'file_copy') {
        thisTask['source_location'] = task['source'];
        thisTask['target_location'] = task['target'];
      }
      else if (task['type'] === 'sql') {
        thisTask['connection'] = task['target']['connection'];
        thisTask['sql_string'] = task['configuration'];
      }
      else {
        thisTask = task['target']; // Really just noop
      }
      asset['etl_tasks'].push(thisTask);
    }
  }
  await client.end();
  return Promise.resolve(assetMap);
}

async function getRungroups(connection) {
  const client = new Client(connection);
  let sql = `SELECT run_group_name,	cron_string FROM bedrock.run_groups;`;
  await client.connect();
  return await client.query(sql)
    .then(res => {
      const rungroups = [];
      for (let i = 0; i < res.rowCount; ++i) {
        const cname = res.rows[i]['run_group_name'];
        const cstring = res.rows[i]['cron_string'];
        const cron = awsCronParser.parse(cstring);
        const minutes = TIME_INTERVAL;
        const ms = 1000 * 60 * minutes;
        let curTime = new Date(Math.round(new Date().getTime() / ms) * ms);
        let nextTime = new Date(curTime);
        const delta = minutes * 60 * 1000;
        nextTime.setTime(nextTime.getTime() + delta);
        let occurrence = awsCronParser.next(cron, curTime);
        if (occurrence.getTime() < nextTime.getTime()) {
          rungroups.push(cname);
        }
      }
      if (debug) console.log('Selected rungroups: ', rungroups);
      return Promise.resolve(rungroups);
    })
    .catch(err => {
      let errmsg = pgErrorCodes[err.code]
      throw new Error([`Postgres error: ${errmsg}`, err]);
    });

}

lambda_handler = async function (event, context) {
  try {
    const dbConnection = await getConnectionObject()
    let rungroups = [event.rungroup];
    if (event.rungroup === undefined) {
      rungroups = await getRungroups(dbConnection);
    }
    let assetMap = await readEtlList(dbConnection, rungroups);
    assetMap = await readDependencies(dbConnection, assetMap);
    assetMap = await readTasks(dbConnection, assetMap);

    const graph = [];
    const level = {};
    // Set up the array of dependencies and of initial levels
    for (nm in assetMap) {
      let asset = assetMap[nm];
      level[nm] = 0;
      for (let i = 0; i < asset.depends.length; ++i) {
        // Test here is in case nm depends on an asset that has no etl
        // job. The dependency information is then not relevant to the
        // etl run, though it might be important in an application such
        // as change management.
        if (asset.depends[i] in assetMap) {
          graph.push([asset.depends[i], nm]);
        }
      }
    }

    let runs = [];
    if (graph.length > 0) {
      const sorted = toposort(graph);
      let maxLevel = 0;
      while (sorted.length > 0) {
        let a = sorted.shift();
        let asset = assetMap[a];
        for (let i = 0; i < asset.depends.length; ++i) {
          let depLevel = level[asset.depends[i]]
          if (level[a] <= depLevel) level[a] = depLevel + 1;
          if (level[a] > maxLevel) maxLevel = level[a];
        }
      }
      // Now gather into groups of runsets
      runs = new Array(maxLevel + 1);
      for (let i = 0; i < maxLevel + 1; ++i) runs[i] = [];
      for (a in level) runs[level[a]].push(assetMap[a]);
    }else{
      for( asset in assetMap ) {
        runs.push([assetMap[asset]]);
      }
    }
    // And create the final run map
    let result = { 'RunSetIsGo': false };
    if (runs.length > 0) {
      result = {
        'runsets': runs,
        'RunSetIsGo': true,
        'success': [],
        'skipped': [],
        'failure': [],
        'results': null,
      }
    };

    const finalResult = (formatRes(200, result));
    if (debug) console.log(JSON.stringify(finalResult));
    return finalResult;
  }
  catch (err) {
    let res = formatRes(500, JSON.stringify(err, Object.getOwnPropertyNames(err)));
    if (debug) console.log('Error: ', res);
    return res;
  }
}
/* Uncomment next statement to run locally */
// debug = 1;
let event = {};
// event = {'rungroup':'daily'};
if (debug) {
  (async () => {
    await lambda_handler(event, context = null);
    process.exit();
  })();
}


module.exports = {
  lambda_handler
};