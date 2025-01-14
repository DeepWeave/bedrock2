/* eslint-disable camelcase */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */

import pgpkg from 'pg';
const { Client } = pgpkg;
import acppkg from 'aws-cron-parser';
const { parse, prev } = acppkg;
import toposort from 'toposort';
// Disabling import/no-unresolved because the dependency as defined
// in package.json only works in the build subdirectory.
// eslint-disable-next-line import/no-unresolved
import { getDBConnection } from 'bedrock_common';

const TIME_INTERVAL = 15; // Frequency - must match Eventbridge scheduler

function formatRes(code, result) {
  return {
    statusCode: code,
    body: result,
  };
}

import pgErrorCodes from './pgErrorCodes.js';

async function readEtlList(client, run_groups) {
  let etlList = [];
  if (run_groups.length > 0) {
    const rgString = run_groups.reduce((accumulator, currentValue) => {
      const sep = (accumulator !== '') ? ', ' : '';
      return `${accumulator + sep}'${currentValue}'`;
    }, '');
    const sql = `SELECT * FROM ${process.env.BEDROCK_DB_SCHEMA}.etl_view where run_group_name in (${rgString}) and active = true;`;
    const res = await client.query(sql)
      .catch((err) => {
        const errmsg = pgErrorCodes[err.code];
        throw new Error([`Postgres error: ${errmsg}`, err]);
      });
    etlList = res.rows;
  }

  const assetMap = {};
  const arr = Object.values(etlList);
  for (let i = 0; i < arr.length; i += 1) {
    const asset = arr[i];
    assetMap[asset.asset_name] = {
      name: asset.asset_name,
      run_group: asset.run_group_name,
      depends: [],
      etl_tasks: [],
    };
  }
  return assetMap;
}

async function readDependencies(client, assetMap) {
  const arr = Object.entries(assetMap);
  for (let i = 0; i < arr.length; i += 1) {
    const asset = arr[i][1];
    const sql = `SELECT * FROM ${process.env.BEDROCK_DB_SCHEMA}.dependency_view where asset_name = '${arr[i][0]}';`;
    // eslint-disable-next-line no-await-in-loop
    const res = await client.query(sql)
      .catch((err) => {
        const errmsg = pgErrorCodes[err.code];
        throw new Error([`Postgres error: ${errmsg}`, err]);
      });
    for (let j = 0; j < res.rowCount; j += 1) {
      const d = res.rows[j].dependency;
      if (d[0] === '#') { // Aggregate Dependancy. Look up list of dependencies in tags
        const aggrDependency = d.slice(1);
        const aggrSql = `SELECT asset_name FROM ${process.env.BEDROCK_DB_SCHEMA}.asset_tag_view where tag_name = '${aggrDependency}';`;
        // eslint-disable-next-line no-await-in-loop
        const aggrRes = await client.query(aggrSql)
          .catch((err) => {
            const errmsg = pgErrorCodes[err.code];
            throw new Error([`Postgres error: ${errmsg} 2`, err]);
          });
        for (let k = 0; k < aggrRes.rowCount; k += 1) {
          const aggrD = aggrRes.rows[k].asset_name;
          asset.depends.push(aggrD);
        }
      } else {
        asset.depends.push(d);
      }
    }
  }
  return assetMap;
}

async function readLocationFromAsset(client, assetName) {
  // add asset_name into location json
  const sql = `   select assets.location || 
   jsonb_build_object('connection', secret_name) || 
   jsonb_build_object('asset', asset_name) as location
   FROM ${process.env.BEDROCK_DB_SCHEMA}.assets
   inner join ${process.env.BEDROCK_DB_SCHEMA}.connections conn
   on location->>'connection_id' = conn.connection_id 
   where asset_name = '${assetName}';`;
  // eslint-disable-next-line no-await-in-loop
  const res = await client.query(sql)
    .catch((err) => {
      const errmsg = pgErrorCodes[err.code];
      throw new Error([`Postgres error: ${errmsg}`, err]);
    });
  if (res.rowCount === 0) {
    throw new Error(`Asset ${assetName} not found`);
  }
  const locData = res.rows[0].location;
  return locData;
}

async function readAggregateData(client, tempLocation, location, taskSource, email) {
  const { aggregate, data_range, data_connection } = taskSource;
  const sql = `
  select a.asset_name, location->>'spreadsheetid' spreadsheetid, 
  location->>'tab' tab from ${process.env.BEDROCK_DB_SCHEMA}.assets a  
  join ${process.env.BEDROCK_DB_SCHEMA}.asset_tag_view using (asset_id)
  where tag_name = '${aggregate}' and active = true;
  `;
  // process.stdout.write(sql);
  return client.query(sql)
    .then((res) => {
      const aggregateTasks = [];
      for (let i = 0; i < res.rowCount; i += 1) {
        const { asset_name, spreadsheetid, tab } = res.rows[i];
        const tempTargetLocal = { ...tempLocation };
        if (i === 0) { // first row empty table
          tempTargetLocal.append = false;
        } else {
          tempTargetLocal.append = true;
        }

        const task = {
          type: 'table_copy',
          active: true,
          source_location: {
            asset: asset_name,
            spreadsheetid,
            tab,
            range: data_range,
            connection: data_connection,
            append_asset_name: !!taskSource.append_asset_name,
            append_tab_name: !!taskSource.append_tab_name,
          },
          target_location: tempTargetLocal,
        };
        if(email) {
          task.email = email;
        } 
        aggregateTasks.push(task);
      }
      // final copy temp to real
      const task = {
        type: 'table_copy',
        active: true,
        source_location: tempLocation,
        target_location: location,
      };
      aggregateTasks.push(task);
      return aggregateTasks;
    })
    .catch((err) => {
      const errmsg = pgErrorCodes[err.code];
      throw new Error([`Postgres error: ${errmsg}`, err]);
    });
}

async function readTasks(client, assetMap) {
  const arr = Object.entries(assetMap);

  for (let i = 0; i < arr.length; i += 1) {
    const assetName = arr[i][0];
    const asset = arr[i][1];
    const sql = `SELECT * FROM ${process.env.BEDROCK_DB_SCHEMA}.task_view where asset_name = '${assetName}' order by seq_number;`;

    // eslint-disable-next-line no-await-in-loop
    const res = await client.query(sql)
      .catch((err) => {
        const errmsg = pgErrorCodes[err.code];
        throw new Error([`Postgres error: ${errmsg}`, err]);
      });
    for (let j = 0; j < res.rowCount; j += 1) {
      const task = res.rows[j];
      let thisTask = {
        type: task.type,
        active: task.active,
      };
      if(task.target.email) {
        thisTask.email = task.target.email;
      }
      if (task.type === 'table_copy' || task.type === 'file_copy') {
        let sourceLoc;
        let targetLoc;
        if (task?.source?.asset) { // source data is in asset location
          sourceLoc = await readLocationFromAsset(client, task.source.asset);
        }
        if (task?.target?.asset) { // target data is in asset location
          targetLoc = await readLocationFromAsset(client, task.target.asset);
        }
        thisTask.source_location = { ...task.source, ...sourceLoc };
        thisTask.target_location = { ...task.target, ...targetLoc };
        asset.etl_tasks.push(thisTask);
      } else if (task.type === 'aggregate') {
        const tempLocation = await readLocationFromAsset(client, task.source.temp_table);
        const location = await readLocationFromAsset(client, task.target.asset);
        const aggregateTasks = await readAggregateData(client, tempLocation, location, task.source, thisTask.email);
        asset.etl_tasks = aggregateTasks;
      } else if (task.type === 'run_lambda' || task.type === 'encrypt') {
        thisTask = task.target;
        asset.etl_tasks.push(thisTask);
      } else if (task.type === 'sql') {
        thisTask.connection = task.target.connection;
        // thisTask = {...thisTask, ...task.target};
        thisTask.sql_string = task.configuration;
        asset.etl_tasks.push(thisTask);
      } else {
        thisTask.source_location = task.source;
        thisTask.target_location = task.target;
        asset.etl_tasks.push(thisTask);
      }
    }
  }
  return assetMap;
}

// Get Cron based run_group list
async function getRunGroups(client, debug) {
  const sql = `SELECT run_group_name, cron_string FROM ${process.env.BEDROCK_DB_SCHEMA}.run_groups;`;
  return client.query(sql)
    .then((res) => {
      const run_groups = [];
      for (let i = 0; i < res.rowCount; i += 1) {
        const cname = res.rows[i].run_group_name;
        const cstring = res.rows[i].cron_string;
        const cron = parse(cstring);
        const minutes = TIME_INTERVAL;
        const ms = 1000 * 60 * minutes;
        const curTime = new Date();
        const latestPreviousTimeMS = (prev(cron, curTime)).getTime();
        const endPreviousTimeSlot = latestPreviousTimeMS + ms;
        // See if current time falls within TIME_INTERVAL following the latest run time
        if (endPreviousTimeSlot >= curTime.getTime()) {
          run_groups.push(cname);
        }
      }
      if (debug) console.log('Selected run_groups: ', run_groups);
      return run_groups;
    })
    .catch((err) => {
      const errmsg = pgErrorCodes[err.code];
      throw new Error([`Postgres error: ${errmsg}`, err]);
    });
}

async function verifyAssetExists(client, assetName) {
  const sql = `SELECT * FROM ${process.env.BEDROCK_DB_SCHEMA}.etl_view where asset_name = '${assetName}';`;
  return client.query(sql)
    .then((res) => {
      if (res.rowCount === 0) {
        return false;
      }
      return true;
    })
    .catch((err) => {
      const errmsg = pgErrorCodes[err.code];
      throw new Error([`Postgres error: ${errmsg}`, err]);
    });
}

// eslint-disable-next-line camelcase
const lambda_handler = async function x(event) {
  let debug = event.debug || false;
  let client;
  try {
    const dbConnection = await getDBConnection();
    client = new Client(dbConnection);
    await client.connect()
      .catch((err) => {
        const errmsg = pgErrorCodes[err.code];
        throw new Error([`Postgres error: ${errmsg}`, err]);
      });
    let run_groups = [event.run_group];
    if (event.run_group === 'UseCronStrings') {
      run_groups = await getRunGroups(client, debug);
    }
    let assetMap = {};
    if (event.one_asset) {
      const assetExists = await verifyAssetExists(client, event.one_asset);
      if (assetExists) {
        assetMap = {
          [event.one_asset]: {
            name: event.one_asset, run_group: event.run_group, depends: [], etl_tasks: [],
          },
        };
      }
    } else {
      assetMap = await readEtlList(client, run_groups);
    }
    assetMap = await readDependencies(client, assetMap);
    assetMap = await readTasks(client, assetMap);

    const graph = [];
    const level = {};
    // Set up the array of dependencies and of initial levels
    Object.entries(assetMap).forEach((e) => {
      const asset = e[1];
      level[e[0]] = 0;
      for (let i = 0; i < asset.depends.length; i += 1) {
        // Test here is in case nm depends on an asset that has no etl
        // job. The dependency information is then not relevant to the
        // etl run, though it might be important in an application such
        // as change management.
        if (asset.depends[i] in assetMap) {
          graph.push([asset.depends[i], e[0]]);
        }
      }
    });

    let runs = [];
    if (graph.length > 0) {
      const sorted = toposort(graph);
      let maxLevel = 0;
      while (sorted.length > 0) {
        const a = sorted.shift();
        const asset = assetMap[a];
        for (let i = 0; i < asset.depends.length; i += 1) {
          const depLevel = level[asset.depends[i]];
          if (level[a] <= depLevel) level[a] = depLevel + 1;
          if (level[a] > maxLevel) maxLevel = level[a];
        }
      }
      // Now gather into groups of runsets
      runs = new Array(maxLevel + 1);
      for (let i = 0; i < maxLevel + 1; i += 1) runs[i] = [];
      Object.keys(level).forEach((a) => runs[level[a]].push(assetMap[a]));
    } else {
      Object.values(assetMap).forEach((asset) => {
        runs.push([asset]);
      });
    }
    // And create the final run map
    let result = { RunSetIsGo: false };
    if (runs.length > 0) {
      result = {
        runsets: runs,
        RunSetIsGo: true,
        success: [],
        noemail: [],
        skipped: [],
        failure: [],
        results: null,
      };
    }

    const finalResult = (formatRes(200, result));
    if (debug) console.log(JSON.stringify(finalResult, null, 2));
    return finalResult;
  } catch (err) {
    let failureObj = {
      "name": "Error in create-etl-run-map",
      "result": err.stack
    }
    let result = {
      RunSetIsGo: false,
      success: [],
      noemail: [],
      skipped: [],
      failure: [failureObj],
      results: null,
    };
    const finalResult = (formatRes(200, result));
    if (debug) console.log(JSON.stringify(finalResult, null, 2));
    return finalResult;
  } finally {
    await client.end();
  }
};

export { lambda_handler };