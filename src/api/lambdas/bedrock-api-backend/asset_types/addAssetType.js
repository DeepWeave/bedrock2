/* eslint-disable import/extensions */
/* eslint-disable no-console */
import {
  newClient, checkInfo, checkExistence, addInfo, generateId, addAssetTypeCustomFields
} from '../utilities/utilities.js';

function checkCustomFields(body) {
  if (body.custom_fields) {
    if (!body.custom_fields.every((value) => typeof value === 'object')) {
      throw new Error('Custom fields lacking required property or formatted incorrectly.');
    }
  }
}

async function addAssetType(
  connection,
  allFields,
  body,
  idField,
  name,
  tableName,
  tableNameCustomFields,
  requiredFields,
) {
  const shouldExist = false;
  let client;
  let clientInitiated = false;
  const bodyWithID = {
    ...body,
  };
  bodyWithID[idField] = generateId();
  const idValue = bodyWithID[idField];

  const response = {
    error: false,
    message: `Successfully added ${name} ${idValue}`,
    result: null,
  };

  try {
    client = await newClient(connection);
    clientInitiated = true;
    checkInfo(bodyWithID, requiredFields, name, idValue, idField);
    checkCustomFields(bodyWithID);
  } catch (error) {
    if (clientInitiated) {
      await client.end();
    }
    response.error = true;
    response.message = error.message;
    return response;
  }

  try {
    await client.query('BEGIN');
    await checkExistence(client, tableName, idField, idValue, name, shouldExist);
    response.result = await addInfo(client, allFields, bodyWithID, tableName, name);
    if (body.custom_fields?.length > 0) {
        response.result.custom_fields = await addAssetTypeCustomFields(client, idValue, body);
    } else {
      response.result.custom_fields = [];
    }
    await client.query('COMMIT');
    await client.end();
  } catch (error) {
    await client.query('ROLLBACK');
    if (clientInitiated) {
      await client.end();
    }
    response.error = true;
    response.message = error.message;
    return response;
  }
  return response;
}

export default addAssetType;
