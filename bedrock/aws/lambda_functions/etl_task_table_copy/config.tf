terraform {
  backend "s3" {
    bucket = "ca-tfstate-store"
    key    = "terraform/bedrock/lambda_functions/etl_task_table_copy/terraform_dev.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  profile	= var.aws_profile
  region	= var.region
}

resource "aws_lambda_function" "etl_task_table_copy" {
    filename        = "function.zip"
    function_name   = "etl_task_table_copy"
    role            = data.terraform_remote_state.lambda_role.outputs.bedrock_lambda_role_arn
    handler         = "handler.lambda_handler"
    runtime         = "nodejs12.x"
    source_code_hash = filebase64sha256("function.zip")
    timeout         = 480
    vpc_config {
      subnet_ids         = ["subnet-00e55df750014753d", "subnet-0c119b605ff498f3b"]
      security_group_ids = ["sg-076e12ba2a9012944"]
    }
}

output "etl_task_table_copy_arn" {
  value = "${aws_lambda_function.etl_task_table_copy.arn}"
}