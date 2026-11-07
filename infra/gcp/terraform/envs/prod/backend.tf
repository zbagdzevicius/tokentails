# Remote state in the versioned bucket made by ../../bootstrap. Partial config on purpose (no project id in git):
#   terraform init -backend-config="bucket=gleaming-medium-480114-g5-tfstate" -backend-config="prefix=envs/prod"
# Tests and validation use `terraform init -backend=false`.
terraform {
  backend "gcs" {}
}
