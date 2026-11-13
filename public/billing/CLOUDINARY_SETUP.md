# Cloudinary product images

Supabase remains the database and authentication provider. Cloudinary stores product images; `products.image_url` holds its delivery URL and `products.image_public_id` identifies the asset for delete/replace operations. Cloudinary API credentials are only used by the Supabase Edge Function and the one-time migration script; never add the API secret to browser configuration.

## Configure and deploy

1. In the Supabase SQL editor for the project configured in `supabase-config.js`, run the standalone database migration [`cloudinary_image_migration.sql`](./cloudinary_image_migration.sql). It adds `image_public_id` and repairs the authenticated product/category/customer table grants and RLS policies needed by the admin screens. It is safe to run more than once.
2. In the Supabase Dashboard for that project, open **Edge Functions → Secrets** and add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. Do not put these values in `supabase-config.js` or commit them.

   `SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided to deployed Supabase Edge Functions by Supabase.
3. Deploy the authenticated function:

   ```powershell
   $projectRef = "YOUR_SUPABASE_PROJECT_REF"
   supabase functions deploy cloudinary-images --project-ref $projectRef
   ```

If you have not authenticated the Supabase CLI on this computer, run `supabase login` first. The function only accepts signed-in Supabase users, signs image uploads, and deletes product assets after validating their generated product ID.

## Migrate existing product images

Use the downloaded bucket folder and the credentials for the same Supabase project currently configured by the website. `SUPABASE_SERVICE_ROLE_KEY` must stay private; setting it only in the current PowerShell process keeps it out of source control.

```powershell
$env:SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "YOUR_SERVICE_ROLE_KEY"

node scripts\migrate-cloudinary-images.mjs --image-dir "C:\Users\harih\Downloads\prI\all_images"
```

The first run is a dry run: it checks product rows and confirms every referenced Supabase Storage image has exactly one local file match. Resolve any missing/ambiguous files before proceeding. When the report is correct, perform the uploads and database updates with:

```powershell
$env:CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME"
$env:CLOUDINARY_API_KEY = "YOUR_API_KEY"
$env:CLOUDINARY_API_SECRET = "YOUR_API_SECRET"
node scripts\migrate-cloudinary-images.mjs --image-dir "C:\Users\harih\Downloads\prI\all_images" --execute
```

The migration uploads every image file in the downloaded folder. It links images referenced by product rows using stable product-based public IDs, then updates those rows' `image_url` and `image_public_id`. Unreferenced files are uploaded to Cloudinary's `shri-senthura/imported` folder. Progress is recorded in `.cloudinary-migration-state.json` inside the downloaded folder so interrupted runs can resume; keep that file until migration and verification are complete. Do not delete the old Supabase bucket until the migrated site has been checked and backed up.
