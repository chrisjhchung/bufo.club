output "worker_vars" {
  description = "Values to copy into the matching env block of apps/api/wrangler.jsonc."
  value = {
    CDN_BASE           = "https://${local.cdn_hostname}"
    ACCESS_TEAM_DOMAIN = "${var.zero_trust_team_name}.cloudflareaccess.com"
    ACCESS_AUD         = cloudflare_zero_trust_access_application.admin.aud
    ADMIN_EMAILS       = join(",", var.admin_emails)
    D1_DATABASE_ID     = cloudflare_d1_database.bufo.id
  }
}

output "turnstile_sitekey" {
  description = "Set as VITE_TURNSTILE_SITEKEY when building the web app."
  value       = cloudflare_turnstile_widget.uploads.id
}

output "turnstile_secret" {
  description = "Set as the TURNSTILE_SECRET Worker secret."
  value       = cloudflare_turnstile_widget.uploads.secret
  sensitive   = true
}

output "buckets" {
  value = {
    assets  = cloudflare_r2_bucket.assets.name
    pending = cloudflare_r2_bucket.pending.name
    cdn     = local.cdn_hostname
  }
}
