// Production Extension Packaging Script for Sahayak AI Browser Agent (Milestone 4.6)
// Compresses dist/ into a standard production zip archive and computes SHA-256 checksum.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const distZipDir = path.resolve(rootDir, 'dist-zip');

/**
 * Reads manifest.json to get extension name and version.
 */
function getManifestInfo() {
  const manifestPath = path.resolve(distDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('dist/manifest.json not found. Please run "npm run build" first.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return {
    name: manifest.name || 'sahayak-ai-browser',
    version: manifest.version || '1.0.1',
  };
}

/**
 * Recursively retrieves all files in a directory with relative paths.
 */
function getFilesRecursively(dir, base = '') {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? `${base}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath, relPath));
    } else if (entry.isFile()) {
      results.push({
        fullPath,
        relPath: relPath.replace(/\\/g, '/'),
        size: fs.statSync(fullPath).size,
      });
    }
  }

  return results;
}

/**
 * Creates a standard compliant ZIP file from a list of files using pure Node.js (zlib).
 * Works across Windows, macOS, and Linux with zero external dependencies.
 */
export function buildZipArchive(fileList) {
  const localHeaders = [];
  const centralHeaders = [];
  let currentOffset = 0;

  // Modern DOS time/date for reproducible ZIP headers
  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((Math.floor(now.getSeconds() / 2)) & 0x1f);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const item of fileList) {
    const fileBuffer = fs.readFileSync(item.fullPath);
    const nameBuffer = Buffer.from(item.relPath, 'utf-8');
    const uncompressedSize = fileBuffer.length;
    const compressedBuffer = zlib.deflateRawSync(fileBuffer, { level: 9 });
    const compressedSize = compressedBuffer.length;
    const crc = zlib.crc32(fileBuffer);

    // 1. Local File Header (30 bytes + filename + data)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6);     // Bit flag: UTF-8 filenames
    localHeader.writeUInt16LE(8, 8);          // Compression: Deflate
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);         // Extra field length

    const localRecord = Buffer.concat([localHeader, nameBuffer, compressedBuffer]);
    localHeaders.push(localRecord);

    // 2. Central Directory Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central file header signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by: 2.0
    centralHeader.writeUInt16LE(20, 6);         // Version needed: 2.0
    centralHeader.writeUInt16LE(0x0800, 8);     // Bit flag: UTF-8
    centralHeader.writeUInt16LE(8, 10);         // Compression: Deflate
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);         // Extra field length
    centralHeader.writeUInt16LE(0, 32);         // File comment length
    centralHeader.writeUInt16LE(0, 34);         // Disk number start
    centralHeader.writeUInt16LE(0, 36);         // Internal attributes
    centralHeader.writeUInt32LE(0, 38);         // External attributes
    centralHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header

    const centralRecord = Buffer.concat([centralHeader, nameBuffer]);
    centralHeaders.push(centralRecord);

    currentOffset += localRecord.length;
  }

  const centralDirectoryBuffer = Buffer.concat(centralHeaders);
  const cdSize = centralDirectoryBuffer.length;
  const cdOffset = currentOffset;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // EOCD signature
  eocd.writeUInt16LE(0, 4);                     // Disk number
  eocd.writeUInt16LE(0, 6);                     // Disk where CD starts
  eocd.writeUInt16LE(fileList.length, 8);       // Records on this disk
  eocd.writeUInt16LE(fileList.length, 10);      // Total records
  eocd.writeUInt32LE(cdSize, 12);               // Size of central directory
  eocd.writeUInt32LE(cdOffset, 16);             // Offset of central directory
  eocd.writeUInt16LE(0, 20);                    // Comment length

  return Buffer.concat([...localHeaders, centralDirectoryBuffer, eocd]);
}

/**
 * Validates the structure and entries of a ZIP buffer.
 */
export function verifyZipArchive(zipBuffer) {
  if (!zipBuffer || zipBuffer.length < 22) {
    throw new Error('ZIP buffer is invalid or too small.');
  }

  // Find EOCD signature from end of file
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= 0; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Valid End of Central Directory record not found in ZIP.');
  }

  const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10);
  const cdSize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let ptr = cdOffset;

  for (let i = 0; i < entryCount; i++) {
    if (zipBuffer.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error(`Corrupted central directory entry at index ${i}`);
    }
    const nameLen = zipBuffer.readUInt16LE(ptr + 28);
    const extraLen = zipBuffer.readUInt16LE(ptr + 30);
    const commentLen = zipBuffer.readUInt16LE(ptr + 32);
    const uncompressedSize = zipBuffer.readUInt32LE(ptr + 24);
    const compressedSize = zipBuffer.readUInt32LE(ptr + 20);

    const name = zipBuffer.toString('utf-8', ptr + 46, ptr + 46 + nameLen);
    entries.push({ name, compressedSize, uncompressedSize });

    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return {
    entryCount,
    cdSize,
    cdOffset,
    entries,
  };
}

/**
 * Main packaging runner.
 */
export async function packageExtension() {
  console.log('\n========================================================');
  console.log('🚀 Sahayak AI Browser Agent - Production Packager');
  console.log('========================================================\n');

  const { name, version } = getManifestInfo();
  const zipFileName = `sahayak-v${version}.zip`;

  if (!fs.existsSync(distZipDir)) {
    fs.mkdirSync(distZipDir, { recursive: true });
  }

  const targetZipPathInDistZip = path.resolve(distZipDir, zipFileName);
  const targetZipPathInRoot = path.resolve(rootDir, zipFileName);

  console.log(`Scanning distribution files in: ${distDir}`);
  const files = getFilesRecursively(distDir);
  console.log(`Found ${files.length} production files to package.\n`);

  // Verify critical files are present
  const requiredFiles = [
    'manifest.json',
    'background/index.js',
    'content/index.js',
    'sidepanel/index.html',
    'sidepanel/index.js',
    'sidepanel/index.css',
    'icons/icon-128.png',
  ];

  for (const req of requiredFiles) {
    if (!files.some((f) => f.relPath === req)) {
      throw new Error(`CRITICAL: Required production file "${req}" is missing from dist/!`);
    }
  }

  console.log('Building ZIP archive with Deflate compression...');
  const zipBuffer = buildZipArchive(files);

  // Write ZIP to dist-zip/ and root
  fs.writeFileSync(targetZipPathInDistZip, zipBuffer);
  fs.writeFileSync(targetZipPathInRoot, zipBuffer);

  // Calculate SHA-256 Checksum
  const sha256 = crypto.createHash('sha256').update(zipBuffer).digest('hex');
  const checksumFile = `${targetZipPathInDistZip}.sha256`;
  const rootChecksumFile = `${targetZipPathInRoot}.sha256`;
  fs.writeFileSync(checksumFile, `${sha256}  ${zipFileName}\n`);
  fs.writeFileSync(rootChecksumFile, `${sha256}  ${zipFileName}\n`);

  // Verify archive
  const verification = verifyZipArchive(zipBuffer);

  const totalRawSize = files.reduce((acc, f) => acc + f.size, 0);
  const zipSize = zipBuffer.length;
  const ratio = Math.round((1 - zipSize / totalRawSize) * 100);

  console.log('✅ Archive verified successfully:');
  console.log(`   - Archive File:      ${zipFileName}`);
  console.log(`   - Output Paths:      ${targetZipPathInDistZip}`);
  console.log(`                        ${targetZipPathInRoot}`);
  console.log(`   - Total Files:       ${verification.entryCount} entries`);
  console.log(`   - Uncompressed:      ${(totalRawSize / 1024).toFixed(1)} KB`);
  console.log(`   - Compressed:        ${(zipSize / 1024).toFixed(1)} KB (${ratio}% reduction)`);
  console.log(`   - SHA-256 Checksum:  ${sha256}`);
  console.log(`   - Checksum File:     ${checksumFile}\n`);

  console.log('📦 Production bundle ready for Chrome Web Store & GitHub Release!\n');
  return {
    zipFileName,
    zipSize,
    sha256,
    entryCount: verification.entryCount,
  };
}

// Execute if run directly from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  packageExtension().catch((err) => {
    console.error('❌ Packaging failed:', err);
    process.exit(1);
  });
}

