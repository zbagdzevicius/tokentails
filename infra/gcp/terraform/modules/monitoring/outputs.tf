output "notification_channel" {
  value = google_monitoring_notification_channel.email.id
}

output "log_metrics" {
  value = [
    google_logging_metric.relay_loop_p99.name,
    google_logging_metric.relay_rooms_live.name,
    google_logging_metric.relay_events.name,
    google_logging_metric.cron_lease_failures.name,
    google_logging_metric.armor_denied.name,
    google_logging_metric.relay_turn_overrun_p99.name,
    google_logging_metric.relay_rtt_p95.name,
    google_logging_metric.relay_rtt_eu_p95.name,
  ]
}

# LATENCY-PLAN C4: the latency alerts' thresholds and the fields their metrics read (terraform test).
output "latency_alerts" {
  value = {
    overrun_ms      = google_monitoring_alert_policy.relay_turn_overrun.conditions[0].condition_threshold[0].threshold_value
    rtt_eu_ms       = google_monitoring_alert_policy.relay_rtt_eu.conditions[0].condition_threshold[0].threshold_value
    loop_ms         = google_monitoring_alert_policy.relay_loop.conditions[0].condition_threshold[0].threshold_value
    overrun_extract = google_logging_metric.relay_turn_overrun_p99.value_extractor
    rtt_eu_extract  = google_logging_metric.relay_rtt_eu_p95.value_extractor
    rtt_eu_filter   = google_logging_metric.relay_rtt_eu_p95.filter
  }
}

output "uptime_checks" {
  value = { for k, c in google_monitoring_uptime_check_config.check : k => c.http_check[0].path }
}
