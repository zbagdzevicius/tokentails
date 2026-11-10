# LATENCY-PLAN C1-C4 (docs/plans/moba/LATENCY-NEXT.md, infra/gcp/RUNBOOK.md "Latency"): mocked providers, no
# credentials, no cloud calls. Run from envs/prod with the other tests:
#   terraform init -backend=false && terraform test -test-directory=../../../tests
# A file of its own (not prod.tftest.hcl) so it merges cleanly beside other open infra work.

mock_provider "google" {
  mock_data "google_project" {
    defaults = {
      number = "123456789012"
    }
  }
}

mock_provider "google-beta" {}

variables {
  project_id      = "gleaming-medium-480114-g5"
  billing_account = "000000-000000-000000"
  alert_email     = "alerts@example.com"
  backend_tag     = "0000000"
  web_tag         = "0000000"
  cms_tag         = "0000000"
}

run "relay_runtime_flags" {
  command = apply

  assert {
    condition     = module.relay_vm.settings.plain_env.NODE_OPTIONS == "--max-semi-space-size=64" && module.relay_vm.settings.plain_env.UV_THREADPOOL_SIZE == "8"
    error_message = "The relay runs with a 64 MB semi-space and 8 libuv threads (R3)."
  }
  assert {
    condition     = strcontains(module.relay_vm.runtime_config.env, "NODE_OPTIONS=--max-semi-space-size=64") && strcontains(module.relay_vm.runtime_config.env, "UV_THREADPOOL_SIZE=8")
    error_message = "The runtime flags reach the relay's env file."
  }
}

run "relay_region_defaults_to_the_region" {
  command = apply

  assert {
    condition     = module.relay_vm.settings.region == "europe-west3" && module.edge.settings.region == "europe-west3"
    error_message = "relay_region null: the relay follows var.region."
  }
}

run "relay_region_same_as_region_is_accepted" {
  command = plan

  variables {
    relay_region = "europe-west3"
  }

  assert {
    condition     = module.relay_vm.settings.region == "europe-west3"
    error_message = "An explicit relay_region equal to region is used."
  }
}

run "relay_region_elsewhere_is_refused_while_the_alb_is_regional" {
  command = plan

  variables {
    relay_region = "europe-west1"
  }

  expect_failures = [var.relay_region]
}

run "latency_alerts" {
  command = apply

  assert {
    condition     = module.monitoring.latency_alerts.overrun_ms == 5 && module.monitoring.latency_alerts.rtt_eu_ms == 80 && module.monitoring.latency_alerts.loop_ms == 15
    error_message = "Alerts: turn overrun p99 > 5 ms, EU RTT p95 > 80 ms, loop delay p99 > 15 ms."
  }
  assert {
    condition     = module.monitoring.latency_alerts.overrun_extract == "EXTRACT(jsonPayload.turn_overrun_ms_p99)" && module.monitoring.latency_alerts.rtt_eu_extract == "EXTRACT(jsonPayload.rtt_ms_p95_eu)"
    error_message = "The metrics read the relay_stats keys the backend writes (relay-rtt.ts, party-relay.ts counters)."
  }
  assert {
    condition     = strcontains(module.monitoring.latency_alerts.rtt_eu_filter, "jsonPayload.rtt_ms_p95_eu:*")
    error_message = "The EU metric reads only lines that carry an EU sample."
  }
  assert {
    condition     = contains(module.monitoring.log_metrics, "relay_turn_overrun_p99_ms") && contains(module.monitoring.log_metrics, "relay_rtt_eu_p95_ms") && contains(module.monitoring.log_metrics, "relay_rtt_p95_ms")
    error_message = "The latency log-based metrics exist."
  }
}

run "budget_whole_project_by_default" {
  command = apply

  assert {
    condition     = try(length(module.budget.labels), 0) == 0
    error_message = "No label filter unless the founder sets budget_labels."
  }
}

run "budget_label_filter" {
  command = apply

  variables {
    budget_labels = { app = "tokentails" }
  }

  assert {
    condition     = module.budget.labels == tomap({ app = "tokentails" })
    error_message = "budget_labels filters the budget."
  }
}
