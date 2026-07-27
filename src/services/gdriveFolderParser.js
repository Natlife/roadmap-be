const { ApiError } = require('../middleware/error');

/**
 * Parses Google Drive Folder URL or ID, fetches the public folder page,
 * and extracts all file IDs to return direct embeddable image URLs.
 */

function parseFolderId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // Pattern 1: https://drive.google.com/drive/folders/FOLDER_ID or /u/0/folders/FOLDER_ID
  const match = trimmed.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,50})/);
  if (match) return match[1];

  // Pattern 2: raw folder ID string
  if (/^[a-zA-Z0-9_-]{25,50}$/.test(trimmed)) return trimmed;

  return null;
}

function extractFileIds(html, folderId) {
  const ids = new Set();

  // 1. Direct file links: /file/d/FILE_ID
  const fileLinkRegex = /\/file\/d\/([a-zA-Z0-9_-]{25,50})/g;
  let m;
  while ((m = fileLinkRegex.exec(html)) !== null) {
    if (m[1] !== folderId) ids.add(m[1]);
  }

  // 2. JS arrays in Drive HTML: ["FILE_ID","filename.ext"...] or ["FILE_ID","image/..."]
  const jsArrayRegex = /\["([a-zA-Z0-9_-]{25,50})",\s*"(?:[^"]*)"/g;
  while ((m = jsArrayRegex.exec(html)) !== null) {
    if (m[1] !== folderId) ids.add(m[1]);
  }

  // 3. String matches near mimeTypes: "FILE_ID" ... "image/"
  const mimeRegex = /"([a-zA-Z0-9_-]{25,50})".*?"image\//gi;
  while ((m = mimeRegex.exec(html)) !== null) {
    if (m[1] !== folderId) ids.add(m[1]);
  }

  return Array.from(ids);
}

async function parseGDriveFolder(inputUrl) {
  const folderId = parseFolderId(inputUrl);
  if (!folderId) {
    throw ApiError.badRequest('Invalid Google Drive Folder URL or ID. Please check the link.');
  }

  const url = `https://drive.google.com/drive/folders/${folderId}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      throw ApiError.badRequest(`Could not access Google Drive folder (HTTP ${response.status}). Make sure folder permissions are set to "Anyone with the link can view".`);
    }

    const html = await response.text();
    const fileIds = extractFileIds(html, folderId);

    const imageUrls = fileIds.map((id) => `https://lh3.googleusercontent.com/d/${id}`);

    return {
      folderId,
      count: imageUrls.length,
      urls: imageUrls,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.badRequest(`Error reading Google Drive folder: ${err.message}`);
  }
}

module.exports = {
  parseFolderId,
  extractFileIds,
  parseGDriveFolder,
};
