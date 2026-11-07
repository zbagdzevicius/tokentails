locals {
  relay_logs = "resource.type=\"gce_instance\" AND logName:\"cos_containers\""
  relay_events = [
    "refused_busy", "checkpoint_lost", "referee_lag", "referee_error", "relay_error", "mp_verify_failed",
    "room_abandoned", "join_fail_global", "party_not_found", "restored",
  ]
  run_api = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.api_service}\""
}

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "Token Tails founder"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# Log-based metrics (relay_stats lines from backend/src/shared/runtime/relay-stats.reporter.ts, relay and cron logs)

resource "google_logging_metric" "relay_loop_p99" {
  project         = var.project_id
  name            = "relay_loop_p99_ms"
  description     = "Relay event-loop delay p99 (ms), one sample a minute."
  filter          = "${local.relay_logs} AND jsonPayload.event=\"relay_stats\""
  value_extractor = "EXTRACT(jsonPayload.loop_delay_p99)"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "ms"
  }

  bucket_options {
    exponential_buckets {
      num_finite_buckets = 40
      growth_factor      = 1.25
      scale              = 0.5
    }
  }
}

resource "google_logging_metric" "relay_rooms_live" {
  project         = var.project_id
  name            = "relay_rooms_live"
  description     = "Live relay rooms, one sample a minute."
  filter          = "${local.relay_logs} AND jsonPayload.event=\"relay_stats\""
  value_extractor = "EXTRACT(jsonPayload.rooms_live)"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "1"
  }

  bucket_options {
    linear_buckets {
      num_finite_buckets = 200
      width              = 1
      offset             = 0
    }
  }
}

resource "google_logging_metric" "relay_events" {
  project     = var.project_id
  name        = "relay_events"
  description = "Relay events by name (refused_busy, restores, desync verify failures, checkpoint loss, ...)."
  filter      = "${local.relay_logs} AND textPayload=~\"(${join("|", local.relay_events)})\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key        = "event"
      value_type = "STRING"
    }
  }

  label_extractors = {
    event = "REGEXP_EXTRACT(textPayload, \"(${join("|", local.relay_events)})\")"
  }
}

resource "google_logging_metric" "cron_lease_failures" {
  project     = var.project_id
  name        = "cron_lease_failures"
  description = "Leased cron jobs that threw (backend/src/shared/jobs/lease.ts)."
  filter      = "${local.run_api} AND textPayload:\"JobLease\" AND textPayload:\"failed\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_logging_metric" "armor_denied" {
  project     = var.project_id
  name        = "armor_denied"
  description = "Requests Cloud Armor denied (not from Cloudflare, or throttled)."
  filter      = "resource.type=\"http_external_regional_lb_rule\" AND jsonPayload.enforcedSecurityPolicy.outcome=\"DENY\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# Health checks are frequent and say nothing new: keep them out of the log bill.
resource "google_logging_project_exclusion" "health" {
  count       = var.health_log_exclusion ? 1 : 0
  project     = var.project_id
  name        = "exclude-health-checks"
  description = "LB and Cloud Run health-check request logs."
  filter      = "(resource.type=\"http_external_regional_lb_rule\" OR resource.type=\"cloud_run_revision\") AND (httpRequest.requestUrl:\"/healthz\" OR httpRequest.requestUrl:\"/readyz\") AND httpRequest.status<400"
}

# ---------------------------------------------------------------------------------------------------------------------
# Uptime checks through Cloudflare (the real path players take)

resource "google_monitoring_uptime_check_config" "check" {
  for_each = {
    api   = { host = var.api_host, path = "/healthz", match = "\"ok\":true" }
    relay = { host = var.api_host, path = "/pawlegends/ws/healthz", match = "\"role\":\"relay\"" }
    web   = { host = var.web_host, path = "/", match = "" }
  }
  project      = var.project_id
  display_name = "tt-${each.key}"
  timeout      = "10s"
  period       = var.uptime_period

  http_check {
    path           = each.value.path
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = each.value.host
    }
  }

  dynamic "content_matchers" {
    for_each = each.value.match == "" ? [] : [each.value.match]
    content {
      content = content_matchers.value
      matcher = "CONTAINS_STRING"
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  for_each     = google_monitoring_uptime_check_config.check
  project      = var.project_id
  display_name = "Uptime failed: ${each.value.display_name}"
  combiner     = "OR"

  conditions {
    display_name = "${each.value.display_name} failing"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${each.value.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "300s"
      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

# ---------------------------------------------------------------------------------------------------------------------
# Alerts

resource "google_monitoring_alert_policy" "relay_loop" {
  project      = var.project_id
  display_name = "Relay event loop p99 > ${var.relay_loop_p99_ms} ms"
  combiner     = "OR"

  conditions {
    display_name = "loop p99"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.relay_loop_p99.name}\" AND resource.type=\"gce_instance\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.relay_loop_p99_ms
      duration        = "300s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  documentation {
    content = "Players will feel lag. Check `curl localhost:8080/healthz` on the relay VM; consider t2d-standard-4 (infra/gcp/RUNBOOK.md, Scaling the relay)."
  }
}

resource "google_monitoring_alert_policy" "relay_rooms" {
  project      = var.project_id
  display_name = "Relay live rooms > 80% of MAX_LIVE_ROOMS"
  combiner     = "OR"

  conditions {
    display_name = "rooms_live"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.relay_rooms_live.name}\" AND resource.type=\"gce_instance\""
      comparison      = "COMPARISON_GT"
      threshold_value = floor(var.max_live_rooms * 0.8)
      duration        = "300s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "relay_cpu" {
  project      = var.project_id
  display_name = "Relay VM CPU > 70%"
  combiner     = "OR"

  conditions {
    display_name = "cpu"
    condition_threshold {
      filter          = "metric.type=\"compute.googleapis.com/instance/cpu/utilization\" AND resource.type=\"gce_instance\" AND metric.label.instance_name=starts_with(\"${var.relay_instance_prefix}\")"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.7
      duration        = "600s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "relay_autoheal" {
  project      = var.project_id
  display_name = "Relay VM autohealed or recreated"
  combiner     = "OR"

  conditions {
    display_name = "repair"
    condition_matched_log {
      filter = "resource.type=\"gce_instance\" AND protoPayload.methodName=~\"compute.instances.repair.recreateInstance|compute.instances.hostError|compute.instances.preempted\""
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
    auto_close = "1800s"
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "relay_events" {
  project      = var.project_id
  display_name = "Relay refused rooms (server_busy) or lost checkpoints"
  combiner     = "OR"

  conditions {
    display_name = "refused_busy / checkpoint_lost"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.relay_events.name}\" AND resource.type=\"gce_instance\" AND (metric.label.event=\"refused_busy\" OR metric.label.event=\"checkpoint_lost\")"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "api_5xx" {
  project      = var.project_id
  display_name = "tt-api 5xx > ${var.api_5xx_ratio * 100}%"
  combiner     = "OR"

  conditions {
    display_name = "5xx ratio"
    condition_threshold {
      filter             = "${local.run_api} AND metric.type=\"run.googleapis.com/request_count\" AND metric.label.response_code_class=\"5xx\""
      denominator_filter = "${local.run_api} AND metric.type=\"run.googleapis.com/request_count\""
      comparison         = "COMPARISON_GT"
      threshold_value    = var.api_5xx_ratio
      duration           = "300s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
      denominator_aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "api_latency" {
  project      = var.project_id
  display_name = "tt-api p95 latency > ${var.api_p95_ms} ms"
  combiner     = "OR"

  conditions {
    display_name = "p95"
    condition_threshold {
      filter          = "${local.run_api} AND metric.type=\"run.googleapis.com/request_latencies\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.api_p95_ms
      duration        = "300s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_PERCENTILE_95"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "api_max_instances" {
  project      = var.project_id
  display_name = "tt-api at max instances"
  combiner     = "OR"

  conditions {
    display_name = "instance_count"
    condition_threshold {
      filter          = "${local.run_api} AND metric.type=\"run.googleapis.com/container/instance_count\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.api_max_instances - 0.5
      duration        = "600s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "cron_failures" {
  project      = var.project_id
  display_name = "Leased cron job failed"
  combiner     = "OR"

  conditions {
    display_name = "cron failures"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.cron_lease_failures.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 2
      duration        = "0s"
      aggregations {
        alignment_period     = "1800s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "nat_errors" {
  project      = var.project_id
  display_name = "Cloud NAT allocation failed (Atlas or RPC egress at risk)"
  combiner     = "OR"

  conditions {
    display_name = "nat_allocation_failed"
    condition_threshold {
      filter          = "metric.type=\"router.googleapis.com/nat/nat_allocation_failed\" AND resource.type=\"nat_gateway\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_COUNT_TRUE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "armor_spike" {
  project      = var.project_id
  display_name = "Cloud Armor 403/429 spike"
  combiner     = "OR"

  conditions {
    display_name = "denied"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.armor_denied.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 500
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

# ---------------------------------------------------------------------------------------------------------------------
# Latency SLO for tt-api: 95 % of requests under api_p95_ms over 28 days, burn-rate alert

resource "google_monitoring_custom_service" "api" {
  project      = var.project_id
  service_id   = "tt-api"
  display_name = "tt-api"
}

resource "google_monitoring_slo" "api_latency" {
  project      = var.project_id
  service      = google_monitoring_custom_service.api.service_id
  slo_id       = "tt-api-latency"
  display_name = "95% of tt-api requests under ${var.api_p95_ms} ms"
  goal         = 0.95

  rolling_period_days = 28

  request_based_sli {
    distribution_cut {
      distribution_filter = "${local.run_api} AND metric.type=\"run.googleapis.com/request_latencies\""
      range {
        min = 0
        max = var.api_p95_ms
      }
    }
  }
}

resource "google_monitoring_alert_policy" "api_slo_burn" {
  project      = var.project_id
  display_name = "tt-api latency SLO burning fast"
  combiner     = "OR"

  conditions {
    display_name = "burn rate > 10 over 1 h"
    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.api_latency.name}\", \"3600s\")"
      comparison      = "COMPARISON_GT"
      threshold_value = 10
      duration        = "0s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}
