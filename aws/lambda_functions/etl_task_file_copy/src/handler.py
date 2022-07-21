import boto3
import json
import io
import os
import datetime
from copy_s3 import download_s3, upload_s3
from copy_ftp import put_ftp, get_ftp


region_name = "us-east-1"  # for secrets manager

def fillDateTemplate(filename):
    filename = filename.replace('${','{')
    now = datetime.datetime.now()
    year = now.year
    month = now.strftime("%m")
    day = now.strftime("%d")
    hour = now.strftime("%H")
    minute = now.strftime("%M")
    second = now.strftime("%S")
    return (filename.format(YYYY=year,MM=month,DD=day,HH=hour,mm=minute,SS=second))


def getConnection(secret_name):
    try:
        session = boto3.session.Session()
        client = session.client(
            service_name='secretsmanager',
            region_name=region_name,
        )
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )
        results = json.loads(get_secret_value_response['SecretString'])
        return results
    except BaseException as err:
        raise Exception("Connection Secret Error: " + str(err))

def buildMsg(target_location):
    return ('File uploaded to ' +
    target_location["connection_data"]["type"] + ': ' +
    target_location["connection"] + ' ' + target_location["filename"]) 

def lambda_handler(event, context):
    try:
        taskindex = event["TaskIndex"]
        etl = event["ETLJob"]["etl_tasks"][taskindex]
        if not etl["active"]:
            return {
                'statusCode': 200,
                'body': "Inactive: skipped"
            }
        tempfile = fillDateTemplate('/tmp/temp${YYYY}${MM}${DD}${HH}${mm}${SS}.txt') 

        locations = [
          { "name": 'source_location', "tempfile": tempfile },
          { "name": 'target_location', "tempfile": tempfile }
        ]

        for loc in locations:
            location = etl[loc["name"]]
            loc["connection_data"] = getConnection(location["connection"])
            loc["filename"] = fillDateTemplate(location["filename"])
            loc["path"] = location["path"]
            loc["connection"] = location["connection"]

        source_location = locations[0]
        if source_location["connection_data"]["type"] == "s3":
            download_s3(source_location)
        elif source_location["connection_data"]["type"] == "sftp":
            get_ftp(source_location)
        
        target_location = locations[1]
        if target_location["connection_data"]["type"] == "s3":
            upload_s3(target_location)
        elif target_location["connection_data"]["type"] == "sftp":
            put_ftp(target_location)
            
        retmsg = buildMsg(target_location)

        if os.path.exists(tempfile):
                os.remove(tempfile)

        return {
            'statusCode': 200,
            'body': retmsg
        }
    except BaseException as err:
        print(str(err))
        return {
            'statusCode': 500,
            'body': str(err)
        }


