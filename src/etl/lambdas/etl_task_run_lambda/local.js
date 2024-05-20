import { lambda_handler } from './handler.js';
let event = {
    "JobIsGo": true,
    "ETLJob": {
      "name": "acumen_staff.api",
      "run_group": "daily",
      "depends": [
      ],
      "etl_tasks": [
        {
          "type": "run_lambda",
          "active": true,
          "lambda_arn": "arn:aws:lambda:us-east-1:518970837364:function:acumen-staff-upload",
          "description": "Upload Staff data to Acumen API"
        }
      ]
    },
    "TaskIndex": 0,
    "JobType": "run_lambda"
  };

await lambda_handler(event);

