from cement import Controller, ex
import os
import boto3
import botocore
import json
import sys

from ..src.utilities.print import print_list_in_columns
from ..src.utilities.connections import get_connections
from ..src.blueprint.blueprint import get_blueprint, list_blueprints, create_table_from_blueprint, create_blueprint_from_table
from ..src.utilities.sql import execute_sql_statement
from ..src.utilities.constants import *


class BedrockBlueprint(Controller):
    class Meta:
        label = "blueprint"
        stacked_type = "nested"
        stacked_on = "base"
    
    @ex(
        help="Create a table based on a blueprint",

        arguments=[
            ### create-table command help
            ( [ "-b", "--blueprint"],
              { "help": "blueprint name"} ),
            ( [ "-c", "--connection" ],
              { "help": "connection name"} ),
            ( [ "-t", "--table" ],
              { "help": "table name in form schema.tablename"} )
        ],
    )
    def create_table(self):
        bucket_name = os.getenv("BEDROCK_BUCKETNAME")
        tmpfiledir = os.getenv("BEDROCK_TMPFILE_DIR")
        tmpfilename = os.getenv("BEDROCK_TMPFILE_NAME")
        if tmpfiledir is None:
            tmpfiledir = "."
        if tmpfilename is None:
            tmpfilename = "tmp.json"
        tmpfilepath = tmpfiledir + "/" + tmpfilename

        connections = {}
        s3 = boto3.client("s3")

        if bucket_name is None:
            print("You must set the BEDROCK_BUCKETNAME environment variable to the appropriate bucket name.")
            return -1

        # Get the list of possible connections, then make sure we have chosen one.
        connections = get_connections(s3, bucket_name, tmpfilepath)
        if self.app.pargs.connection is None or self.app.pargs.connection not in connections:
            print("\nA connection name is required. Must be one of the following:\n")
            print_list_in_columns(list(connections.keys()))
            return -1
        connection = connections[self.app.pargs.connection]

        # Download the blueprint
        blueprint_name = self.app.pargs.blueprint
        blueprint = None
        if blueprint_name is not None:
            blueprint = get_blueprint(s3, bucket_name, BLUEPRINTS_PREFIX + blueprint_name + ".json", tmpfilepath)
        if blueprint is None:
            blueprints = list_blueprints(s3, bucket_name, BLUEPRINTS_PREFIX)
            print("\nBlue print " + (blueprint_name if blueprint_name is not None else "")  + " not found. Must be one of:\n")
            print_list_in_columns(blueprints)
            return -1

        if self.app.pargs.table is None or len(self.app.pargs.table.split(".")) != 2:
            print("\nA table name of the form SCHEMA.TABLENAME is required.\n")
            return -1

        sql = create_table_from_blueprint(blueprint, self.app.pargs.table, connection["type"])
        execute_sql_statement(connection, sql)
        pass

    @ex(
        help="Create a blueprint, possibly based on a table",

        arguments=[
            ### create-table command help
            ( [ "-b", "--blueprint"],
              { "help": "blueprint name"} ),
            ( [ "-c", "--connection" ],
              { "help": "connection name"} ),
            ( [ "-t", "--table" ],
              { "help": "table name in form schema.tablename"} )
        ],
    )
    def create_blueprint(self):
        bucket_name = os.getenv("BEDROCK_BUCKETNAME")
        tmpfiledir = os.getenv("BEDROCK_TMPFILE_DIR")
        tmpfilename = os.getenv("BEDROCK_TMPFILE_NAME")
        if tmpfiledir is None:
            tmpfiledir = "."
        if tmpfilename is None:
            tmpfilename = "tmp.json"
        tmpfilepath = tmpfiledir + "/" + tmpfilename

        connections = {}
        s3 = boto3.client("s3")

        if bucket_name is None:
            print("You must set the BEDROCK_BUCKETNAME environment variable to the appropriate bucket name.")
            return -1
        if self.app.pargs.blueprint is None:
            print("You must set a blueprint name.")
            return -1
        table_name = None
        if self.app.pargs.table is not None:
            table_name = self.app.pargs.table
        blueprint = None
        if table_name is not None: # Looks like we are deriving from an existing table or view
            # Get the list of possible connections, then make sure we have chosen one.
            connections = get_connections(s3, bucket_name, tmpfilepath)
            if self.app.pargs.connection is None or self.app.pargs.connection not in connections:
                print("\nA connection name is required. Must be one of the following:\n")
                print_list_in_columns(list(connections.keys()))
                return -1
            connection = connections[self.app.pargs.connection]
            blueprint = create_blueprint_from_table(connection, self.app.pargs.blueprint, table_name)
