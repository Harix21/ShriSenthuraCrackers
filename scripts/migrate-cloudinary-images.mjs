import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const imageDirIndex = args.indexOf("--image-dir");
const imageDir = imageDirIndex >= 0 ? args[imageDirIndex + 1] : "";
const pageSize = 1000;
const cloudinaryFolder = "shri-senthura/products";
const importedAssetsFolder = "shri-senthura/imported";
const imageExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in the current shell before running the migration.`);
  return value;
}

function parseArgs() {
  if (imageDirIndex >= 0 && !imageDir) {
    throw new Error("Pass a directory after --image-dir.");
  }
  if (!imageDir) {
    throw new Error('Pass --image-dir "C:\\path\\to\\downloaded\\images".');
  }
  return path.resolve(imageDir);
}

async function listFiles(directory, result = new Map()) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await listFiles(entryPath, result);
    } else if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      const candidates = result.get(entry.name) || [];
      candidates.push(entryPath);
      result.set(entry.name, candidates);
    }
  }
  return result;
}

async function readProductRows(supabaseUrl, serviceRoleKey) {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${supabaseUrl}/rest/v1/products`);
    url.searchParams.set("select", "id,image_url,image_public_id");
    url.searchParams.set("order", "id.asc");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { headers });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Supabase product query failed (${response.status}): ${data.message || JSON.stringify(data)}`);
    }
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

function isSupabaseProductImage(url) {
  try {
    return new URL(url).pathname.includes("/storage/v1/object/public/product-images/");
  } catch {
    return false;
  }
}

function imageFilename(imageUrl) {
  const filename = new URL(imageUrl).pathname.split("/").pop();
  return decodeURIComponent(filename);
}

function cloudinarySignature(params, apiSecret) {
  const payload = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&") + apiSecret;
  return createHash("sha1").update(payload).digest("hex");
}

function mimeType(filename) {
  const extension = path.extname(filename).toLowerCase();
  const types = {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  const type = types[extension];
  if (!type) throw new Error(`Unsupported image format: ${filename}`);
  return type;
}

async function uploadToCloudinary(filePath, publicId, folder, cloudName, apiKey, apiSecret) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params = {
    folder,
    overwrite: "true",
    public_id: publicId,
    timestamp,
  };
  const formData = new FormData();
  formData.set("file", new Blob([await readFile(filePath)], { type: mimeType(filePath) }), path.basename(filePath));
  formData.set("api_key", apiKey);
  formData.set("folder", folder);
  formData.set("overwrite", "true");
  formData.set("public_id", publicId);
  formData.set("timestamp", timestamp);
  formData.set("signature", cloudinarySignature(params, apiSecret));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
    method: "POST",
    body: formData,
  });
  const result = await response.json();
  if (!response.ok || !result.secure_url || !result.public_id) {
    throw new Error(result.error?.message || `Cloudinary upload failed (${response.status}).`);
  }
  return result;
}

async function updateProduct(supabaseUrl, serviceRoleKey, productId, imageUrl, publicId) {
  const url = new URL(`${supabaseUrl}/rest/v1/products`);
  url.searchParams.set("id", `eq.${productId}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ image_url: imageUrl, image_public_id: publicId }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Supabase update failed (${response.status}): ${result.message || JSON.stringify(result)}`);
  }
  if (result.length !== 1) {
    throw new Error(`Expected one updated product row, got ${result.length}.`);
  }
}

async function readMigrationState(statePath) {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    if (!state || typeof state !== "object" || !state.products || typeof state.products !== "object" || !state.assets || typeof state.assets !== "object") {
      throw new Error("Migration state file has an invalid structure.");
    }
    return state;
  } catch (error) {
    if (error.code === "ENOENT") return { products: {}, assets: {} };
    throw error;
  }
}

async function writeMigrationState(statePath, state) {
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

async function main() {
  const directory = parseArgs();
  const statePath = path.join(directory, ".cloudinary-migration-state.json");
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const files = await listFiles(directory);
  const rows = await readProductRows(supabaseUrl, serviceRoleKey);
  const state = await readMigrationState(statePath);
  const allImages = [...files.values()].flat();
  const pending = [];
  const missing = [];
  const referencedFilePaths = new Set();

  for (const product of rows) {
    if (product.image_public_id && product.image_url?.includes("res.cloudinary.com/")) {
      const completed = state.products[product.id];
      if (completed?.sourceFile) {
        referencedFilePaths.add(path.resolve(directory, completed.sourceFile));
      }
      continue;
    }
    if (!isSupabaseProductImage(product.image_url)) continue;

    let filename;
    try {
      filename = imageFilename(product.image_url);
    } catch {
      missing.push(`${product.id}: invalid image URL`);
      continue;
    }
    const matches = files.get(filename) || [];
    if (matches.length !== 1) {
      missing.push(`${product.id}: ${filename} (${matches.length ? "ambiguous" : "not found"})`);
      continue;
    }
    referencedFilePaths.add(matches[0]);
    pending.push({ product, filePath: matches[0], sourceFile: path.relative(directory, matches[0]) });
  }
  const unreferencedImages = allImages.filter((filePath) => !referencedFilePaths.has(filePath));
  const unreferencedToUpload = unreferencedImages.filter((filePath) => !state.assets[path.relative(directory, filePath)]);

  console.log(`Products in database: ${rows.length}`);
  console.log(`Images in downloaded bucket: ${allImages.length}`);
  console.log(`Product images ready to migrate: ${pending.length}`);
  console.log(`Additional unreferenced images to upload: ${unreferencedToUpload.length}`);
  console.log(`Skipped products (not Supabase product images or already migrated): ${rows.length - pending.length - missing.length}`);
  if (missing.length) {
    console.error("Images needing attention:");
    for (const item of missing) console.error(`  ${item}`);
    throw new Error("Resolve missing/ambiguous local files before starting the migration.");
  }
  if (!execute) {
    console.log("Dry run only. Re-run with --execute to upload images and update product rows.");
    return;
  }

  const cloudName = requiredEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = requiredEnv("CLOUDINARY_API_KEY");
  const apiSecret = requiredEnv("CLOUDINARY_API_SECRET");
  let completed = 0;
  for (const { product, filePath, sourceFile } of pending) {
    const publicId = `product-${product.id}`;
    const uploaded = await uploadToCloudinary(filePath, publicId, cloudinaryFolder, cloudName, apiKey, apiSecret);
    await updateProduct(supabaseUrl, serviceRoleKey, product.id, uploaded.secure_url, uploaded.public_id);
    state.products[product.id] = {
      sourceFile,
      publicId: uploaded.public_id,
      secureUrl: uploaded.secure_url,
    };
    await writeMigrationState(statePath, state);
    completed++;
    console.log(`[${completed}/${pending.length}] Migrated ${product.id} (${path.basename(filePath)})`);
  }

  let uploadedAssets = 0;
  for (const filePath of unreferencedImages) {
    const sourceFile = path.relative(directory, filePath);
    if (state.assets[sourceFile]) continue;

    const assetKey = createHash("sha256").update(sourceFile).digest("hex").slice(0, 32);
    const publicId = `asset-${assetKey}`;
    const uploaded = await uploadToCloudinary(filePath, publicId, importedAssetsFolder, cloudName, apiKey, apiSecret);
    state.assets[sourceFile] = {
      publicId: uploaded.public_id,
      secureUrl: uploaded.secure_url,
    };
    await writeMigrationState(statePath, state);
    uploadedAssets++;
    console.log(`[${uploadedAssets}/${unreferencedImages.length}] Uploaded extra image ${sourceFile}`);
  }
  console.log(`Migration complete: ${completed} product image(s) linked to Supabase and ${uploadedAssets} additional image(s) uploaded.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
