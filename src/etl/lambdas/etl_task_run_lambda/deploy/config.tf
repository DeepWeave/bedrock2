provider "aws" {
  region	= var.region
}

resource "aws_lambda_function" "etl_task_run_lambda-$$INSTANCE$$" {
    description      = "Bedrock - ETL Task Run Lambda" 
    filename        = "../function.zip"
    function_name   = "etl_task_run_lambda-$$INSTANCE$$"
    role            = data.terraform_remote_state.lambda_role.outputs.bedrock_lambda_role_arn
    handler         = "handler.lambda_handler"
    runtime         = "nodejs20.x"
    source_code_hash = filebase64sha256("../function.zip")
    layers = [
      data.terraform_remote_state.bedrock_packages_$$INSTANCE$$.outputs.bedrock_packages_$$INSTANCE$$_layer_arn
    ]
    timeout         = 900
    tags = {
      "coa:application" = "bedrock"
      "coa:department"  = "information-technology"
      "coa:owner"       = "jtwilson@ashevillenc.gov"
      "coa:owner-team"  = "dev"
    }
    vpc_config {
      subnet_ids         = var.subnet_ids
      security_group_ids = var.security_group_ids
    }
}

output "etl_task_run_lambda_arn" {
  value = "${aws_lambda_function.etl_task_run_lambda-$$INSTANCE$$.arn}"
}