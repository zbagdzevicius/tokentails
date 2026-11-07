# Budget alerts only: email at 50/90/100 % of actual spend and 100 % of forecast. Nothing disables billing.
variable "billing_account" {
  type = string
}

variable "project_number" {
  type = string
}

variable "amount" {
  type    = number
  default = 400
}

variable "currency_code" {
  description = "Must match the billing account currency."
  type        = string
  default     = "USD"
}

variable "notification_channels" {
  type = list(string)
}

variable "display_name" {
  type    = string
  default = "Token Tails monthly"
}

resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account
  display_name    = var.display_name

  budget_filter {
    projects        = ["projects/${var.project_number}"]
    calendar_period = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = var.currency_code
      units         = tostring(var.amount)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.9
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  all_updates_rule {
    monitoring_notification_channels = var.notification_channels
    disable_default_iam_recipients   = false
  }
}

output "thresholds" {
  value = [for t in google_billing_budget.monthly.threshold_rules : "${t.threshold_percent}:${t.spend_basis}"]
}
