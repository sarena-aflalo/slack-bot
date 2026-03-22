const { google } = require('googleapis');

const MAX_DOCS = 5;
const MAX_CHARS_PER_DOC = 8000;

// Mime types we can extract text from
const EXPORTABLE_TYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
]);

const DOWNLOADABLE_TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
]);

function getAuthClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');

  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

function escapeDriveQuery(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function extractKeywords(question) {
  const stopWords = new Set([
    'what', 'is', 'the', 'a', 'an', 'how', 'do', 'i', 'can', 'you', 'tell',
    'me', 'about', 'our', 'where', 'when', 'who', 'why', 'which', 'are', 'was',
    'were', 'has', 'have', 'had', 'will', 'would', 'could', 'should', 'please',
    'help', 'find', 'get', 'show', 'give', 'need', 'want', 'know', 'does',
  ]);

  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 6);
}

async function listFilesInFolder(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, webViewLink)',
    pageSize: 20,
    orderBy: 'modifiedTime desc',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files || [];
}

async function fullTextSearch(drive, folderId, query) {
  const safeQuery = escapeDriveQuery(query.slice(0, 100));
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and fullText contains '${safeQuery}' and trashed = false`,
      fields: 'files(id, name, mimeType, webViewLink)',
      pageSize: MAX_DOCS,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return res.data.files || [];
  } catch {
    return [];
  }
}

async function getFileContent(drive, file) {
  try {
    if (EXPORTABLE_TYPES.has(file.mimeType)) {
      const exportMime =
        file.mimeType === 'application/vnd.google-apps.spreadsheet'
          ? 'text/csv'
          : file.mimeType === 'application/vnd.google-apps.presentation'
          ? 'text/plain'
          : 'text/plain';

      const res = await drive.files.export(
        { fileId: file.id, mimeType: exportMime, supportsAllDrives: true },
        { responseType: 'text' }
      );
      return String(res.data);
    }

    if (DOWNLOADABLE_TEXT_TYPES.has(file.mimeType)) {
      const res = await drive.files.get(
        { fileId: file.id, alt: 'media', supportsAllDrives: true },
        { responseType: 'text' }
      );
      return String(res.data);
    }

    // Unsupported type (PDF, images, etc.)
    return null;
  } catch (err) {
    console.warn(`Could not read file "${file.name}": ${err.message}`);
    return null;
  }
}

async function searchAndFetchDocuments(question) {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID env var is not set');

  // Try full-text search first; fall back to listing all files
  let files = await fullTextSearch(drive, folderId, question);

  if (files.length === 0) {
    const keywords = extractKeywords(question);
    if (keywords.length > 0) {
      files = await fullTextSearch(drive, folderId, keywords.join(' '));
    }
  }

  if (files.length === 0) {
    files = await listFilesInFolder(drive, folderId);
  }

  // Fetch content concurrently, keep only docs with extractable text
  const results = await Promise.all(
    files.slice(0, MAX_DOCS).map(async file => {
      const content = await getFileContent(drive, file);
      if (!content || content.trim().length === 0) return null;

      const truncated =
        content.length > MAX_CHARS_PER_DOC
          ? content.slice(0, MAX_CHARS_PER_DOC) + '\n... [truncated]'
          : content;

      return {
        id: file.id,
        name: file.name,
        url: file.webViewLink,
        content: truncated,
      };
    })
  );

  return results.filter(Boolean);
}

module.exports = { searchAndFetchDocuments };
