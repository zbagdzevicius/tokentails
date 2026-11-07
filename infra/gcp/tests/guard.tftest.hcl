# The project guard: only tokentails-* projects, never the workstation's other-company project.

mock_provider "google" {
  mock_data "google_project" {
    defaults = {
      number = "123456789012"
    }
  }
}

mock_provider "google-beta" {}

variables {
  billing_account = "000000-000000-000000"
  alert_email     = "alerts@example.com"
  backend_tag     = "0000000"
  web_tag         = "0000000"
  cms_tag         = "0000000"
}

run "refuses_motored_project" {
  command = plan

  variables {
    project_id = "motored-497708"
  }

  expect_failures = [var.project_id]
}

run "refuses_non_tokentails_project" {
  command = plan

  variables {
    project_id = "acme-prod"
  }

  expect_failures = [var.project_id]
}

run "refuses_a_lookalike" {
  command = plan

  variables {
    project_id = "tokentails"
  }

  expect_failures = [var.project_id]
}

run "accepts_tokentails_prod" {
  command = plan

  variables {
    project_id = "tokentails-prod"
  }
}

run "refuses_api_without_a_warm_instance" {
  command = plan

  variables {
    project_id = "tokentails-staging"
    api = {
      cpu           = "1"
      memory        = "2Gi"
      min_instances = 0
      max_instances = 4
      concurrency   = 40
    }
  }

  expect_failures = [var.api]
}
