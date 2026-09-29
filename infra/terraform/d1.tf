# Metadata only: submissions, tags, templates, reports and the audit log.
# Migrations are applied by wrangler, not Terraform.
resource "cloudflare_d1_database" "bufo" {
  account_id = var.account_id
  name       = local.database_name

  # The API always reports a read_replication object, so leaving this unset
  # makes every plan try to PUT `null` back and fail with a 400.
  read_replication = {
    mode = "disabled"
  }
}
