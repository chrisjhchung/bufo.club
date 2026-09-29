locals {
  is_production = var.environment == "production"
  suffix        = local.is_production ? "" : "-${var.environment}"

  # bufo.club and cdn.bufo.club in production; staging.bufo.club and
  # cdn-staging.bufo.club otherwise.
  site_hostname = local.is_production ? var.zone_name : "${var.environment}.${var.zone_name}"
  cdn_hostname  = local.is_production ? "cdn.${var.zone_name}" : "cdn-${var.environment}.${var.zone_name}"

  assets_bucket  = "bufo-assets${local.suffix}"
  pending_bucket = "bufo-pending${local.suffix}"
  database_name  = "bufo-db${local.suffix}"
  worker_service = local.is_production ? var.worker_name : "${var.worker_name}-${var.environment}"
}
