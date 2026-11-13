
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const BUCKET = process.env.BUCKET_NAME || "product-images";
const DRY_RUN = process.env.DRY_RUN !== "false";
const CACHE_CONTROL_ONLY = process.env.CACHE_CONTROL_ONLY === "true";
const APPLY_CACHE_CONTROL_REFRESH = process.env.APPLY_CACHE_CONTROL_REFRESH === "true";
const CACHE_CONTROL_SECONDS = "3600";

// 200 KB maximum; target 190 KB.
const MAX_BYTES = 200 * 1024;
const TARGET_BYTES = 190 * 1024;
const PAGE_SIZE = 100;
const MAX_DIMENSION = 1600;

const REPORT = path.join(
  __dirname,
  `report-${Date.now()}.csv`
);

// These formats can be encoded in their original format.
const SUPPORTED = new Set([
  "jpeg", "png", "webp", "avif", "tiff"
]);

const MIME_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

const results = [];

function csv(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function addResult(filePath, before, after, status) {
  results.push({ filePath, before, after, status });

  console.log(
    `${status}: ${filePath} | ${before} -> ${after} bytes`
  );
}

function saveReport() {
  const lines = [
    "path,original_bytes,result_bytes,status",
    ...results.map((r) =>
      [
        r.filePath,
        r.before,
        r.after,
        r.status
      ].map(csv).join(",")
    ),
  ];

  fs.writeFileSync(REPORT, lines.join("\r\n"), "utf8");
}

async function listAll(folder = "") {
  const files = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(folder, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) throw error;

    if (!data || data.length === 0) break;

    for (const item of data) {
      const filePath = folder
        ? `${folder}/${item.name}`
        : item.name;

      // Folders normally have no ID or file metadata.
      if (item.id == null && item.metadata == null) {
        files.push(...await listAll(filePath));
      } else {
        files.push({
          path: filePath,
          size: Number(item.metadata?.size ?? 0),
        });
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return files;
}

async function compressImage(input) {
  const image = sharp(input, {
    animated: false,
    limitInputPixels: 100_000_000,
  });

  const metadata = await image.metadata();
  const format = metadata.format;

  if (!SUPPORTED.has(format)) {
    throw new Error(
      `Unsupported format: ${format}. Original preserved.`
    );
  }

  if ((metadata.pages || 1) > 1) {
    throw new Error(
      "Animated/multi-page image skipped."
    );
  }

  const originalWidth = metadata.width;
  const originalHeight = metadata.height;

  if (!originalWidth || !originalHeight) {
    throw new Error("Could not read image dimensions.");
  }

  // Do not enlarge small images.
  const initialScale = Math.min(
    1,
    MAX_DIMENSION / Math.max(originalWidth, originalHeight)
  );

  for (let attempt = 0; attempt < 18; attempt++) {
    const extraReduction = Math.max(0, attempt - 5);
    const scale = initialScale * Math.pow(0.85, extraReduction);

    const width = Math.max(
      1,
      Math.round(originalWidth * scale)
    );

    const height = Math.max(
      1,
      Math.round(originalHeight * scale)
    );

    const quality = Math.max(25, 85 - attempt * 4);

    let pipeline = sharp(input).resize({
      width,
      height,
      fit: "inside",
      withoutEnlargement: true,
    });

    switch (format) {
      case "jpeg":
        pipeline = pipeline.jpeg({
          quality,
          mozjpeg: true,
        });
        break;

      case "png":
        // Palette encoding can reduce colors.
        // Transparency is retained where supported.
        pipeline = pipeline.png({
          compressionLevel: 9,
          palette: true,
          quality: Math.max(30, quality),
          effort: 10,
        });
        break;

      case "webp":
        pipeline = pipeline.webp({
          quality,
          effort: 6,
          alphaQuality: 90,
        });
        break;

      case "avif":
        pipeline = pipeline.avif({
          quality,
          effort: 6,
        });
        break;

      case "tiff":
        pipeline = pipeline.tiff({
          quality,
          compression: "jpeg",
        });
        break;
    }

    const output = await pipeline.toBuffer();

    if (output.length <= TARGET_BYTES) {
      return { output, format };
    }
  }

  throw new Error(
    "Could not reach 190 KB. Original preserved."
  );
}

async function processFile(file) {
  const ext = path.extname(file.path).slice(1).toLowerCase();

  if (!MIME_TYPES[ext]) {
    addResult(file.path, file.size, file.size, "SKIPPED_EXTENSION");
    return;
  }

  if (file.size <= MAX_BYTES && !CACHE_CONTROL_ONLY) {
    addResult(file.path, file.size, file.size, "ALREADY_SMALL");
    return;
  }

  try {
    if (CACHE_CONTROL_ONLY && !APPLY_CACHE_CONTROL_REFRESH) {
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(file.path);
      const response = await fetch(publicUrl, { method: "HEAD" });
      if (!response.ok) {
        throw new Error(`Could not inspect object headers (HTTP ${response.status}).`);
      }

      const currentCacheControl = response.headers.get("cache-control") || "missing";
      console.log(`CACHE_HEADER: ${file.path} | ${currentCacheControl}`);
      addResult(
        file.path,
        file.size,
        file.size,
        `READY_CACHE_REFRESH: ${currentCacheControl}`
      );
      return;
    }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(file.path);

    if (error) throw error;

    const input = Buffer.from(await data.arrayBuffer());

    if (CACHE_CONTROL_ONLY) {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(file.path, input, {
          upsert: true,
          contentType: MIME_TYPES[ext],
          cacheControl: CACHE_CONTROL_SECONDS,
        });

      if (uploadError) throw uploadError;

      addResult(file.path, input.length, input.length, "CACHE_REFRESHED");
      return;
    }

    const { output, format } = await compressImage(input);

    if (output.length >= input.length) {
      throw new Error(
        "Output is not smaller than original."
      );
    }

    if (output.length > TARGET_BYTES) {
      throw new Error("Output exceeds target size.");
    }

    // Prevent extension/content-type mismatches.
    const expectedFormats = {
      jpg: "jpeg",
      jpeg: "jpeg",
      png: "png",
      webp: "webp",
      avif: "avif",
      tif: "tiff",
      tiff: "tiff",
    };

    if (expectedFormats[ext] !== format) {
      throw new Error(
        `Format mismatch: extension ${ext}, actual ${format}.`
      );
    }

    if (DRY_RUN) {
      addResult(
        file.path,
        input.length,
        output.length,
        "READY_TO_COMPRESS"
      );
      return;
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(file.path, output, {
        upsert: true,
        contentType: MIME_TYPES[ext],
        cacheControl: CACHE_CONTROL_SECONDS,
      });

    if (uploadError) throw uploadError;

    addResult(
      file.path,
      input.length,
      output.length,
      "COMPRESSED"
    );
  } catch (error) {
    addResult(
      file.path,
      file.size,
      file.size,
      `SKIPPED_OR_ERROR: ${error.message}`
    );
  }
}

async function main() {
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !BUCKET
  ) {
    throw new Error("Check your .env configuration.");
  }

  console.log(`Bucket: ${BUCKET}`);
  console.log(`Mode: ${CACHE_CONTROL_ONLY ? `CACHE CONTROL ONLY${APPLY_CACHE_CONTROL_REFRESH ? " (LIVE)" : " (PLAN ONLY)"}` : `IMAGE OPTIMIZATION${DRY_RUN ? " (DRY RUN)" : " (LIVE)"}`}`);
  if (CACHE_CONTROL_ONLY) {
    console.log(`Cache-Control max-age: ${CACHE_CONTROL_SECONDS} seconds`);
    if (!APPLY_CACHE_CONTROL_REFRESH) {
      console.log("No uploads will occur. Set APPLY_CACHE_CONTROL_REFRESH=true only after reviewing the plan.");
    } else {
      console.log("Existing image bytes will be re-uploaded unchanged to set Cache-Control metadata.");
    }
  }
  console.log("Target: 190 KB; maximum: 200 KB");

  const files = await listAll();

  console.log(`Found ${files.length} files.`);

  for (const file of files) {
    await processFile(file);
  }

  saveReport();

  const compressed = results.filter(
    r => r.status === "COMPRESSED"
  );

  const ready = results.filter(
    r => r.status === "READY_TO_COMPRESS"
  );

  const cacheRefreshReady = results.filter(
    r => r.status.startsWith("READY_CACHE_REFRESH")
  );

  const cacheRefreshed = results.filter(
    r => r.status === "CACHE_REFRESHED"
  );

  const skipped = results.filter(
    r => r.status.startsWith("SKIPPED")
  );

  console.log("\nFinished.");
  console.log(`Already small: ${
    results.filter(r => r.status === "ALREADY_SMALL").length
  }`);
  console.log(`Ready in dry run: ${ready.length}`);
  console.log(`Actually compressed: ${compressed.length}`);
  console.log(`Ready for cache refresh: ${cacheRefreshReady.length}`);
  console.log(`Cache metadata refreshed: ${cacheRefreshed.length}`);
  console.log(`Skipped/errors: ${skipped.length}`);
  console.log(`Report: ${REPORT}`);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
