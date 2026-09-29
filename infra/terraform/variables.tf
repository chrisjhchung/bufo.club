variable "cloudflare_api_token" {
  description = "API token with Workers, R2, D1, DNS, Access and Turnstile permissions."
  type        = string
  sensitive   = true
}

variable "account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "zone_id" {
  description = "Zone ID for the site's domain."
  type        = string
}

variable "zone_name" {
  description = "Apex domain, e.g. bufo.club."
  type        = string
}

variable "environment" {
  description = "Deployment name; anything other than 'production' gets suffixed resources."
  type        = string
  default     = "production"
}

variable "worker_name" {
  description = "Worker service name, matching wrangler.jsonc."
  type        = string
  default     = "bufo-club"
}

variable "admin_emails" {
  description = "Emails allowed through Cloudflare Access to /admin."
  type        = list(string)
}

variable "r2_location" {
  description = "R2 location hint."
  type        = string
  default     = "WEUR"
}

variable "zero_trust_team_name" {
  description = "Cloudflare One team name; the <team> in <team>.cloudflareaccess.com."
  type        = string
}
