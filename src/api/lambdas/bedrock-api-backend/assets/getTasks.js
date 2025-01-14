/* eslint-disable no-console */
import pgErrorCodes from '../pgErrorCodes.js';
import { newClient, checkExistence } from '../utilities/utilities.js';

async function getInfo(client, idField, idValue, name, tableName) {
  // Querying database to get information. Function can be used multiple times per method
  // if we need information from multiple tables
  const sql = `SELECT * FROM ${tableName} where ${idField} like $1`;
  let res;
  try {
    res = await client.query(sql, [idValue]);
  } catch (error) {
    throw new Error([`Postgres error: ${pgErrorCodes[error.code]||error.code}`, error]);
  }

  return res;
}

async function readTasks(client, idValue) {
  let res;
  const sql = 'SELECT * FROM bedrock.tasks where asset_id like $1 order by seq_number asc';
  try {
    res = await client.query(sql, [idValue]);
  } catch (error) {
    throw new Error(`PG error getting assets: ${pgErrorCodes[error.code]||error.code}`);
  }
  return res;
}

function formatTasks(res) {
  const tempTasks = [];
  for (let i = 0; i < res.rowCount; i += 1) {
    tempTasks.push(
      {
        task_id: res.rows[i].task_id,
        asset_id: res.rows[i].asset_id,
        seq_number: res.rows[i].seq_number,
        description: res.rows[i].description,
        type: res.rows[i].type,
        active: res.rows[i].active,
        source: res.rows[i].source,
        target: res.rows[i].target,
        configuration: res.rows[i].configuration,
      },
    );
  }
  return tempTasks;
}

async function getTasks(connection, idValue, idField, name) {
  const response = {
        error: false,
        message: '',
        result: {
          items: [],
          run_group: {
          run_group_id: null,
          active: false,
        }}};
  let client;
  let res;
  let tasks = [];
  let runGroup;
  let shouldExist = true;

  try {
    client = await newClient(connection);
  } catch (error) {
    response.error = true;
    response.message = error.message;
    return response;
  }

  try {
    await checkExistence(client, 'bedrock.assets', idField, idValue, name, shouldExist)
    res = await readTasks(client, idValue);
    runGroup = await getInfo(client, idField, idValue, name, 'bedrock.etl')
    if (res.rowCount !== 0) {
      tasks = formatTasks(res);
      response.result.items = tasks;
    }
    if (runGroup.rowCount !== 0) {
      response.result.run_group= {run_group_id: runGroup.rows[0].run_group_id, active: runGroup.rows[0].active};
    }
  } catch (error) {
    await client.end();
    response.error = true;
    response.message = error.message;
    response.result = null;
    return response;
  } finally {
    await client.end();
  }
  return response;
}

export default getTasks;