# Local state OUTSIDE the repo (a throwaway stack: no state bucket to create and then delete). Give the path at init:
#   terraform init -backend-config="path=$SCRATCH/staging.tfstate"
# Tests and validation use `terraform init -backend=false`.
terraform {
  backend "local" {}
}
