# Infrastructure

Terraform owns the Cloudflare account resources; wrangler owns the Worker code.
The split exists because wrangler cannot create buckets, databases, Access
policies or Turnstile widgets, and Terraform is clumsy at shipping code.

## One-time bootstrap

1. **State bucket.** Terraform keeps state in R2 over its S3 API, which cannot
   bootstrap itself. Create it once:

   ```sh
   pnpm --filter @bufo/api exec wrangler r2 bucket create bufo-tfstate
   ```

2. **Tokens.** Create two API tokens in the Cloudflare dashboard:
   - a **Cloudflare API token** with Account → Workers Scripts, Workers R2
     Storage, D1, Access: Apps and Policies, Turnstile, and Zone → DNS edit.
   - an **R2 token** (Object Read & Write) for the Terraform state backend.

3. **Variables.** Copy an example and fill it in — `*.tfvars` is gitignored:

   ```sh
   cp envs/production.tfvars.example envs/production.tfvars
   ```

## First-time ordering

There is a chicken-and-egg between the two tools: `wrangler deploy` needs the
D1 database id, and `cloudflare_workers_custom_domain` needs a Worker that
already exists. Break it with `-target` on the first apply only.

```sh
cd infra/terraform
terraform init
terraform apply -var-file=envs/production.tfvars \
  -target=cloudflare_r2_bucket.assets \
  -target=cloudflare_r2_bucket.pending \
  -target=cloudflare_r2_custom_domain.assets \
  -target=cloudflare_r2_bucket_cors.assets \
  -target=cloudflare_d1_database.bufo \
  -target=cloudflare_turnstile_widget.uploads \
  -target=cloudflare_zero_trust_access_policy.admins \
  -target=cloudflare_zero_trust_access_application.admin

terraform output worker_vars          # -> paste into apps/api/wrangler.jsonc
terraform output turnstile_sitekey    # -> VITE_TURNSTILE_SITEKEY

cd ../..
pnpm build && pnpm --filter @bufo/api exec wrangler deploy --env production
terraform -chdir=infra/terraform output -raw turnstile_secret \
  | pnpm --filter @bufo/api exec wrangler secret put TURNSTILE_SECRET --env production

cd infra/terraform
terraform apply -var-file=envs/production.tfvars   # now attaches bufo.club
```

Every later apply is just the last command.

## Applying

```sh
cd infra/terraform
export TF_VAR_cloudflare_api_token=...        # Cloudflare token
export AWS_ACCESS_KEY_ID=...                  # R2 token, for state
export AWS_SECRET_ACCESS_KEY=...
export AWS_ENDPOINT_URL_S3=https://<account>.r2.cloudflarestorage.com

terraform init
terraform plan  -var-file=envs/production.tfvars
terraform apply -var-file=envs/production.tfvars
```

## After an apply

`terraform output worker_vars` prints the values that have to reach the Worker.
Copy `ACCESS_AUD`, `ADMIN_EMAILS` and `CDN_BASE` into the matching `env` block
of `apps/api/wrangler.jsonc`, and the D1 `database_id` alongside them. Then set
the Turnstile secret and sitekey:

```sh
terraform output -raw turnstile_secret | pnpm --filter @bufo/api exec wrangler secret put TURNSTILE_SECRET --env production
terraform output turnstile_sitekey     # -> VITE_TURNSTILE_SITEKEY repo variable
```

## What each file owns

| File | Resources |
| --- | --- |
| `r2.tf` | `bufo-assets` (+ `cdn.` custom domain, CORS), `bufo-pending` |
| `d1.tf` | the metadata database |
| `worker.tf` | the Worker's custom hostname |
| `access.tf` | Zero Trust application + email allowlist policy for `/admin` |
| `turnstile.tf` | the upload/report widget |

Staging mirrors production with `-staging` suffixes and its own hostnames; pass
`envs/staging.tfvars` instead.
