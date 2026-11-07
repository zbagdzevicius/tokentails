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
  ]
}

output "uptime_checks" {
  value = { for k, c in google_monitoring_uptime_check_config.check : k => c.http_check[0].path }
}
