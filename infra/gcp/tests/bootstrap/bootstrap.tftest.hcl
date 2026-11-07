# terraform test for bootstrap/ (run from infra/gcp/terraform/bootstrap with -test-directory=../../tests/bootstrap).

mock_provider "google" {}

run "state_bucket_private_and_versioned" {
  command = apply

  variables {
    project_id = "gleaming-medium-480114-g5"
  }

  assert {
    condition     = google_storage_bucket.state.public_access_prevention == "enforced"
    error_message = "The state bucket is never public."
  }
  assert {
    condition     = google_storage_bucket.state.uniform_bucket_level_access
    error_message = "Uniform bucket-level access on the state bucket."
  }
  assert {
    condition     = google_storage_bucket.state.versioning[0].enabled
    error_message = "State is versioned."
  }
  assert {
    condition     = google_storage_bucket.state.name == "gleaming-medium-480114-g5-tfstate" && google_storage_bucket.state.location == "europe-west3"
    error_message = "Bucket name and region follow the variables."
  }
}

run "bootstrap_refuses_motored" {
  command = plan

  variables {
    project_id = "motored-497708"
  }

  expect_failures = [var.project_id]
}

run "bootstrap_refuses_other_projects" {
  command = plan

  variables {
    project_id = "tokentails-prod"
  }

  expect_failures = [var.project_id]
}

run "bootstrap_accepts_staging" {
  command = plan

  variables {
    project_id = "tokentails-staging"
  }
}
