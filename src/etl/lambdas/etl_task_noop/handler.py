#!/usr/bin/env python3
import json

def lambda_handler(event, context):
    print(json.dumps(event))
    task = event
    return {
        'statusCode': 200,
        'body': {
            "lambda_output": "Successfully executed a NOOP " + task['JobType']
        }
    }
