import { vi } from 'vitest'
import {
  GoogleDrivePickerError,
  isGoogleDrivePickerReady,
  pickGoogleDriveProjectFile,
} from './googleDrivePicker'

type PickerCallback = (data: Record<string, unknown>) => void

describe('googleDrivePicker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.head.innerHTML = ''
  })

  it('opens Google Picker and resolves the selected Drive project file', async () => {
    const picker = installGooglePicker()
    const load = vi.fn((apiName: string, callback: () => void) => {
      expect(apiName).toBe('picker')
      callback()
    })
    vi.stubGlobal('gapi', { load })
    vi.stubGlobal('google', { picker: picker.api })

    const resultPromise = pickGoogleDriveProjectFile({
      accessToken: 'picker-token',
      appId: '1234567890',
      developerKey: 'picker-api-key',
    })
    await waitForPickerCallback(picker)

    picker.emit({
      action: 'picked',
      docs: [
        {
          id: '1AbC_def-GHIjkl',
          mimeType: 'application/zip',
          name: 'picked-song.eazychorus',
          resourceKey: '0-PickerKey',
          url: 'https://drive.google.com/file/d/1AbC_def-GHIjkl/view',
        },
      ],
    })

    await expect(resultPromise).resolves.toEqual({
      fileId: '1AbC_def-GHIjkl',
      mimeType: 'application/zip',
      name: 'picked-song.eazychorus',
      resourceKey: '0-PickerKey',
      url: 'https://drive.google.com/file/d/1AbC_def-GHIjkl/view',
    })
    expect(load).not.toHaveBeenCalled()
    expect(picker.builder.setOAuthToken).toHaveBeenCalledWith('picker-token')
    expect(picker.builder.setDeveloperKey).toHaveBeenCalledWith(
      'picker-api-key',
    )
    expect(picker.builder.setAppId).toHaveBeenCalledWith('1234567890')
    expect(picker.builder.setMaxItems).toHaveBeenCalledWith(1)
    expect(picker.builder.picker.setVisible).toHaveBeenCalledWith(true)
    expect(isGoogleDrivePickerReady()).toBe(true)
  })

  it('rejects when Google Picker selection is cancelled', async () => {
    const picker = installGooglePicker()
    vi.stubGlobal('gapi', {
      load: vi.fn((_apiName: string, callback: () => void) => callback()),
    })
    vi.stubGlobal('google', { picker: picker.api })

    const resultPromise = pickGoogleDriveProjectFile({
      accessToken: 'picker-token',
      appId: '1234567890',
      developerKey: 'picker-api-key',
    })
    await waitForPickerCallback(picker)

    picker.emit({ action: 'cancel' })

    await expect(resultPromise).rejects.toMatchObject({
      reason: 'google-picker-cancelled',
    })
  })

  it('rejects when Picker config is missing', async () => {
    await expect(
      pickGoogleDriveProjectFile({
        accessToken: '',
        appId: '1234567890',
        developerKey: 'picker-api-key',
      }),
    ).rejects.toBeInstanceOf(GoogleDrivePickerError)
  })
})

function installGooglePicker() {
  let callback: PickerCallback | null = null
  const pickerView = {
    setEnableDrives: vi.fn(() => pickerView),
    setIncludeFolders: vi.fn(() => pickerView),
    setMimeTypes: vi.fn(() => pickerView),
    setSelectFolderEnabled: vi.fn(() => pickerView),
  }
  const pickerInstance = {
    setVisible: vi.fn(),
  }
  const builder = {
    addView: vi.fn(() => builder),
    build: vi.fn(() => pickerInstance),
    enableFeature: vi.fn(() => builder),
    picker: pickerInstance,
    setAppId: vi.fn(() => builder),
    setCallback: vi.fn((nextCallback: PickerCallback) => {
      callback = nextCallback
      return builder
    }),
    setDeveloperKey: vi.fn(() => builder),
    setMaxItems: vi.fn(() => builder),
    setOAuthToken: vi.fn(() => builder),
    setSelectableMimeTypes: vi.fn(() => builder),
    setTitle: vi.fn(() => builder),
  }
  const api = {
    Action: {
      CANCEL: 'cancel',
      ERROR: 'error',
      PICKED: 'picked',
    },
    DocsView: vi.fn(function DocsView() {
      return pickerView
    }),
    Document: {
      ID: 'id',
      MIME_TYPE: 'mimeType',
      NAME: 'name',
      URL: 'url',
    },
    Feature: {
      SUPPORT_DRIVES: 'support-drives',
    },
    PickerBuilder: vi.fn(function PickerBuilder() {
      return builder
    }),
    Response: {
      ACTION: 'action',
      DOCUMENTS: 'docs',
    },
  }

  return {
    api,
    builder,
    emit(data: Record<string, unknown>) {
      if (!callback) {
        throw new Error('Picker callback was not registered')
      }
      callback(data)
    },
  }
}

async function waitForPickerCallback(
  picker: ReturnType<typeof installGooglePicker>,
) {
  for (let index = 0; index < 10; index += 1) {
    if (picker.builder.setCallback.mock.calls.length > 0) {
      return
    }

    await Promise.resolve()
  }

  throw new Error('Picker callback was not registered')
}
