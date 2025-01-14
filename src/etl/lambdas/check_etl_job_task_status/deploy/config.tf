provider "aws" {
  region	= var.region
}

resource "aws_lambda_function" "check_etl_job_task_status-$$INSTANCE$$" {
    description      = "Bedrock - Check ETL Job Task Status" 
    filename        = "../function.zip"
    function_name   = "check_etl_job_task_status-$$INSTANCE$$"
    role            = data.terraform_remote_state.lambda_role.outputs.bedrock_lambda_role_arn
    handler         = "handler.lambda_handler"
    runtime         = "python3.12"
    source_code_hash = filebase64sha256("../function.zip")
    tags = {
      "coa:application" = "bedrock"
      "coa:department"  = "information-technology"
      "coa:owner"       = "jtwilson@ashevillenc.gov"
      "coa:owner-team"  = "dev"
    }
}

output "check_etl_job_task_status_arn" {
  value = "${aws_lambda_function.check_etl_job_task_status-$$INSTANCE$$.arn}"
}
