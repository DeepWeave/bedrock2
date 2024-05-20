from handler import lambda_handler
event = {
  "state": {
    "runsets": [
      [
        {
          "name": "equity_students_completed.goog",
          "run_group": "d",
          "depends": [
            "training_students.lib"
          ],
          "etl_tasks": [
            {
              "type": "table_copy",
              "active": True,
              "source_location": {
                "asset": "equity_students_completed.lib",
                "tablename": "equity_students_completed",
                "connection": "pubrecdb1/mdastore1/dbadmin",
                "schemaname": "aux"
              },
              "target_location": {
                "asset": "equity_students_completed.goog",
                "tab": "Sheet1",
                "range": "A2:Z",
                "filename": "equity_students_completed",
                "connection": "bedrock-googlesheets",
                "spreadsheetid": "1xGD2jVSveuYjDLRc6Z8dlwGIA78LKJKxu0ck0Y7easg"
              }
            }
          ]
        }
      ]
    ],
    "RunSetIsGo": True,
    "success": [],
    "skipped": [],
    "failure": [],
    "results": [
      {
        "JobIsGo": False,
        "ETLJob": {
          "name": "equity_students_completed.goog",
          "run_group": "d",
          "depends": [
            "training_students.lib"
          ],
          "etl_tasks": [
            {
              "type": "table_copy",
              "active": True,
              "source_location": {
                "asset": "equity_students_completed.lib",
                "tablename": "equity_students_completed",
                "connection": "pubrecdb1/mdastore1/dbadmin",
                "schemaname": "aux"
              },
              "target_location": {
                "asset": "equity_students_completed.goog",
                "tab": "Sheet1",
                "range": "A2:Z",
                "filename": "equity_students_completed",
                "connection": "bedrock-googlesheets",
                "spreadsheetid": "1xGD2jVSveuYjDLRc6Z8dlwGIA78LKJKxu0ck0Y7easg"
              },
              "result": {
                "statusCode": 200,
                "body": {
                  "lambda_output": "Google Sheet copied 1xGD2jVSveuYjDLRc6Z8dlwGIA78LKJKxu0ck0Y7easg"
                }
              }
            }
          ]
        },
        "TaskIndex": 0,
        "JobType": "table_copy",
        "results": {
          "JobIsGo": False,
          "ETLJob": {
            "name": "equity_students_completed.goog",
            "run_group": "d",
            "depends": [
              "training_students.lib"
            ],
            "etl_tasks": [
              {
                "type": "table_copy",
                "active": True,
                "source_location": {
                  "asset": "equity_students_completed.lib",
                  "tablename": "equity_students_completed",
                  "connection": "pubrecdb1/mdastore1/dbadmin",
                  "schemaname": "aux"
                },
                "target_location": {
                  "asset": "equity_students_completed.goog",
                  "tab": "Sheet1",
                  "range": "A2:Z",
                  "filename": "equity_students_completed",
                  "connection": "bedrock-googlesheets",
                  "spreadsheetid": "1xGD2jVSveuYjDLRc6Z8dlwGIA78LKJKxu0ck0Y7easg"
                },
                "result": {
                  "statusCode": 200,
                  "body": {
                    "lambda_output": "Google Sheet copied 1xGD2jVSveuYjDLRc6Z8dlwGIA78LKJKxu0ck0Y7easg"
                  }
                }
              }
            ]
          },
          "TaskIndex": 0,
          "JobType": "table_copy"
        }
      }
    ]
  }
}
context = {}

print(lambda_handler(event, context))
