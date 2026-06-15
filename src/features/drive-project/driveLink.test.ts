import { parseGoogleDriveProjectLink } from './driveLink'

describe('drive-project link parser', () => {
  it.each([
    [
      'https://drive.google.com/file/d/1AbC_def-GHIjkl/view?usp=sharing',
      '1AbC_def-GHIjkl',
      'file-path',
    ],
    [
      'https://drive.google.com/open?id=1AbC_def-GHIjkl',
      '1AbC_def-GHIjkl',
      'open-query',
    ],
    [
      'https://drive.google.com/uc?export=download&id=1AbC_def-GHIjkl',
      '1AbC_def-GHIjkl',
      'download-query',
    ],
    [
      'https://drive.usercontent.google.com/download?id=1AbC_def-GHIjkl&export=download',
      '1AbC_def-GHIjkl',
      'download-query',
    ],
    ['1AbC_def-GHIjkl', '1AbC_def-GHIjkl', 'raw-id'],
  ])('extracts a file id from %s', (input, fileId, source) => {
    expect(parseGoogleDriveProjectLink(input)).toEqual({
      ok: true,
      fileId,
      source,
    })
  })

  it.each([
    ['', 'empty'],
    ['https://example.com/file/d/1AbC_def-GHIjkl/view', 'unsupported-host'],
    ['https://drive.google.com/drive/folders/1AbC_def-GHIjkl', 'folder-link'],
    ['https://drive.google.com/file/d/not valid/view', 'invalid-file-id'],
    ['https://drive.google.com/open', 'missing-file-id'],
    ['https://drive.google.com/open?id=not%20valid', 'invalid-file-id'],
    ['not a url', 'invalid-file-id'],
  ])('rejects unsupported input %s', (input, reason) => {
    expect(parseGoogleDriveProjectLink(input)).toEqual({
      ok: false,
      reason,
    })
  })
})
