# Adding downloadable files to a course

Use a **File download** block when learners need a file of their own to work with, such as a worksheet, a template or a spreadsheet of practice data. The file is packed into the SCORM export, so learners download it straight from your LMS. You don't need to host it anywhere else, and the link keeps working if you move the course to a different LMS.

## What you can attach

| Type | Extension |
|---|---|
| Word | `.docx` |
| Excel | `.xlsx` |
| PowerPoint | `.pptx` |
| PDF | `.pdf` |
| CSV | `.csv` |

Each file can be up to **4.5 MB**. Older Office formats (`.doc`, `.xls`, `.ppt`) aren't accepted, so save them in the newer format first.

## Add a file to a page

1. Open the course, choose **Edit course**, and select the page.
2. Add a block and choose **File download** from the content blocks.
3. Click **Choose file**.
   - **Upload** adds a new file from your computer.
   - **Library** reuses a file you've already uploaded.
4. Check the **Link text**. It's filled in from the filename, so change it to something learners will understand, e.g. *Practice data spreadsheet* rather than *dummy_data_v3*.
5. Add a **Description** if it helps, e.g. *Use this in Activity 2*. This is optional.

Changes save when you click out of a field. To swap the file for a new version, click **Replace file**. The link text and description stay as they are.

## What learners see

Each file appears as a card with a download icon, your link text, the description, and the file type and size (e.g. *Excel · 18 KB*). Clicking the card downloads the file under its original name.

You can check the card in **Preview**. Preview downloads the file from online storage rather than from the course package, so test the real download in an LMS before release (see below).

## Tips

- **One file per block.** For three files, add three File download blocks.
- **Reusing a file.** If you put the same file on several pages, it's only packed into the export once.
- **Keep files small.** Every file adds to the size of the SCORM package that learners' LMS has to load.
- **Don't link to files in text blocks.** Text blocks don't support links, and the export removes them. Always use a File download block.
- **Updating a file after export.** The export takes a copy of each file. If you change a file, export the course again and re-upload the package to your LMS.

## Before you release: test in an LMS

LMSs differ in how they serve course files. Check downloads in a real one before learners see the course:

1. Export the course from the **Export** page.
2. Upload the zip to [SCORM Cloud](https://cloud.scorm.com) (the free tier is enough), or to a test course in your own LMS.
3. Open each page with a File download block and click every card.
4. Open each downloaded file to make sure it isn't corrupted.

If a card is missing from the exported course, the file couldn't be fetched when the package was built. Check that the file still exists in the media library, then export again.

If the card is there but clicking it does nothing, the LMS is probably running the course in a sandboxed frame that blocks downloads. The browser console will say "Download is disallowed". Ask the LMS administrator to allow downloads for SCORM content.

## For developers

- **Block type:** `file_download` (content). Its data is `{ url, filename, label, description, mimeType, size }`.
- **Allowed types and size limit:** `src/lib/document-files.ts`. The upload route trusts the file extension and stores the standard MIME type, because browsers often report Office files as `application/octet-stream`.
- **Export:** `src/lib/scorm/build-package.ts` fetches each distinct URL and writes it to `content/files/<sanitised-name>`.
  - Names that clash, ignoring case, get a `-2` suffix.
  - Every bundled file is listed in `imsmanifest.xml`.
  - A file that can't be fetched is logged as an export warning, and its card is left out of the page.
- **Rendering:** `renderContentBlock` in `src/lib/scorm/render-page-html.ts` outputs `<a class="content-download" href="files/…" download="original name">`.
  - Only relative paths and `http(s)` URLs are rendered.
- **Preview:** uses the same renderer. Blob URLs are on a different domain, where the `download` attribute is ignored, so the preview route rewrites each link to `/api/media/download?url=…`. That route only serves URLs recorded in the `Media` table, and sets `Content-Disposition` to the original filename.
  - The preview iframe needs `allow-downloads` in its sandbox, or the browser blocks the download.
