import type { DriveProjectFileLocator } from './types'

const GOOGLE_API_SCRIPT_ID = 'google-api-loader-script'
const GOOGLE_API_SCRIPT_URL = 'https://apis.google.com/js/api.js'
const GOOGLE_PICKER_LOAD_TIMEOUT_MS = 30_000
const EAZY_CHORUS_PICKER_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
].join(',')

type GoogleApiLoader = {
  load: (apiName: string, callback: () => void) => void
}

type GooglePickerAction = {
  CANCEL: string
  ERROR: string
  PICKED: string
}

type GooglePickerResponse = {
  ACTION: string
  DOCUMENTS: string
}

type GooglePickerDocument = {
  ID: string
  MIME_TYPE: string
  NAME: string
  URL: string
}

type GooglePickerFeature = {
  NAV_HIDDEN?: string
  SUPPORT_DRIVES?: string
}

type GooglePickerDocumentObject = {
  id?: string
  mimeType?: string
  name?: string
  resourceKey?: string
  url?: string
}

type GooglePickerResponseObject = Record<string, unknown> & {
  docs?: GooglePickerDocumentObject[]
}

type GooglePickerView = {
  setEnableDrives?: (enabled: boolean) => GooglePickerView
  setIncludeFolders?: (enabled: boolean) => GooglePickerView
  setMimeTypes?: (mimeTypes: string) => GooglePickerView
  setSelectFolderEnabled?: (enabled: boolean) => GooglePickerView
}

type GooglePickerBuilder = {
  addView: (view: GooglePickerView) => GooglePickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
  enableFeature: (feature: string) => GooglePickerBuilder
  setAppId: (appId: string) => GooglePickerBuilder
  setCallback: (
    callback: (data: GooglePickerResponseObject) => void,
  ) => GooglePickerBuilder
  setDeveloperKey: (developerKey: string) => GooglePickerBuilder
  setMaxItems: (maxItems: number) => GooglePickerBuilder
  setOAuthToken: (token: string) => GooglePickerBuilder
  setSelectableMimeTypes?: (mimeTypes: string) => GooglePickerBuilder
  setTitle?: (title: string) => GooglePickerBuilder
}

type GooglePickerApi = {
  Action: GooglePickerAction
  DocsView: new () => GooglePickerView
  Document: GooglePickerDocument
  Feature: GooglePickerFeature
  PickerBuilder: new () => GooglePickerBuilder
  Response: GooglePickerResponse
}

type GooglePickerWindow = {
  picker?: GooglePickerApi
}

declare global {
  interface Window {
    gapi?: GoogleApiLoader
  }
}

export type GoogleDrivePickerErrorReason =
  | 'google-api-load-failed'
  | 'google-picker-cancelled'
  | 'google-picker-error'
  | 'google-picker-load-failed'
  | 'google-picker-missing-config'
  | 'google-picker-unavailable'

export class GoogleDrivePickerError extends Error {
  readonly reason: GoogleDrivePickerErrorReason

  constructor(reason: GoogleDrivePickerErrorReason, message: string) {
    super(message)
    this.name = 'GoogleDrivePickerError'
    this.reason = reason
  }
}

export type GoogleDrivePickedFile = DriveProjectFileLocator & {
  mimeType?: string
  name?: string
  url?: string
}

let googleApiScriptPromise: Promise<void> | null = null
let googlePickerApiPromise: Promise<void> | null = null

export function isGoogleDrivePickerReady(): boolean {
  return !!getGooglePickerApi()?.PickerBuilder
}

export async function preloadGoogleDrivePickerScript(): Promise<void> {
  await loadGoogleApiScript()
  await loadGooglePickerApi()
}

export async function pickGoogleDriveProjectFile({
  accessToken,
  appId,
  developerKey,
}: {
  accessToken: string
  appId: string
  developerKey: string
}): Promise<GoogleDrivePickedFile> {
  const trimmedAccessToken = accessToken.trim()
  const trimmedAppId = appId.trim()
  const trimmedDeveloperKey = developerKey.trim()
  if (!trimmedAccessToken || !trimmedAppId || !trimmedDeveloperKey) {
    throw new GoogleDrivePickerError(
      'google-picker-missing-config',
      'Google Picker 설정을 확인할 수 없습니다.',
    )
  }

  await preloadGoogleDrivePickerScript()
  const pickerApi = getGooglePickerApi()
  if (!pickerApi) {
    throw new GoogleDrivePickerError(
      'google-picker-unavailable',
      'Google Picker를 사용할 수 없습니다.',
    )
  }

  return new Promise((resolve, reject) => {
    let settled = false
    function settle(callback: () => void) {
      if (settled) {
        return
      }

      settled = true
      callback()
    }

    const docsView = new pickerApi.DocsView()
    docsView.setEnableDrives?.(true)
    docsView.setIncludeFolders?.(false)
    docsView.setSelectFolderEnabled?.(false)
    docsView.setMimeTypes?.(EAZY_CHORUS_PICKER_MIME_TYPES)

    const builder = new pickerApi.PickerBuilder()
      .addView(docsView)
      .setOAuthToken(trimmedAccessToken)
      .setDeveloperKey(trimmedDeveloperKey)
      .setAppId(trimmedAppId)
      .setMaxItems(1)
      .setCallback((data) => {
        const action = data[pickerApi.Response.ACTION]
        if (action === pickerApi.Action.CANCEL) {
          settle(() => {
            reject(
              new GoogleDrivePickerError(
                'google-picker-cancelled',
                'Google Drive 파일 선택을 취소했습니다.',
              ),
            )
          })
          return
        }

        if (action === pickerApi.Action.ERROR) {
          settle(() => {
            reject(
              new GoogleDrivePickerError(
                'google-picker-error',
                'Google Drive 파일 선택 중 오류가 발생했습니다.',
              ),
            )
          })
          return
        }

        if (action !== pickerApi.Action.PICKED) {
          return
        }

        const pickedDocument = getPickedDocument(data, pickerApi)
        if (!pickedDocument.fileId) {
          settle(() => {
            reject(
              new GoogleDrivePickerError(
                'google-picker-error',
                '선택한 Google Drive 파일 ID를 확인할 수 없습니다.',
              ),
            )
          })
          return
        }

        settle(() => resolve(pickedDocument))
      })

    builder.setSelectableMimeTypes?.(EAZY_CHORUS_PICKER_MIME_TYPES)
    builder.setTitle?.('Eazy Chorus 프로젝트 선택')
    if (pickerApi.Feature.SUPPORT_DRIVES) {
      builder.enableFeature(pickerApi.Feature.SUPPORT_DRIVES)
    }

    const picker = builder.build()
    picker.setVisible(true)
  })
}

function getPickedDocument(
  data: GooglePickerResponseObject,
  pickerApi: GooglePickerApi,
): GoogleDrivePickedFile {
  const docs = data[pickerApi.Response.DOCUMENTS]
  const document =
    Array.isArray(docs) && docs.length > 0
      ? (docs[0] as GooglePickerDocumentObject)
      : undefined
  const fileId = getPickerDocumentValue(document, pickerApi.Document.ID)
  return {
    fileId: fileId ?? '',
    mimeType: getPickerDocumentValue(document, pickerApi.Document.MIME_TYPE),
    name: getPickerDocumentValue(document, pickerApi.Document.NAME),
    resourceKey: document?.resourceKey,
    url: getPickerDocumentValue(document, pickerApi.Document.URL),
  }
}

function getPickerDocumentValue(
  document: GooglePickerDocumentObject | undefined,
  key: string,
): string | undefined {
  const value = document?.[key as keyof GooglePickerDocumentObject]
  return typeof value === 'string' ? value : undefined
}

function loadGoogleApiScript(): Promise<void> {
  if (window.gapi) {
    return Promise.resolve()
  }

  if (googleApiScriptPromise) {
    return googleApiScriptPromise
  }

  const scriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_API_SCRIPT_ID)
    if (existingScript) {
      if (existingScript.dataset.eazyChorusLoadState === 'loaded') {
        resolve(undefined)
        return
      }

      if (existingScript.dataset.eazyChorusLoadState !== 'failed') {
        bindGoogleApiScriptEvents(existingScript, resolve, reject)
        return
      }

      existingScript.remove()
    }

    const script = document.createElement('script')
    script.id = GOOGLE_API_SCRIPT_ID
    script.src = GOOGLE_API_SCRIPT_URL
    script.async = true
    script.defer = true
    bindGoogleApiScriptEvents(script, resolve, reject)

    document.head.append(script)
  }).catch((error) => {
    googleApiScriptPromise = null
    throw error
  })

  googleApiScriptPromise = scriptPromise
  return scriptPromise
}

function loadGooglePickerApi(): Promise<void> {
  if (isGoogleDrivePickerReady()) {
    return Promise.resolve()
  }

  if (googlePickerApiPromise) {
    return googlePickerApiPromise
  }

  const loader = window.gapi
  if (!loader) {
    return Promise.reject(
      new GoogleDrivePickerError(
        'google-picker-unavailable',
        'Google API loader를 사용할 수 없습니다.',
      ),
    )
  }

  const pickerPromise = new Promise<void>((resolve, reject) => {
    let settled = false
    const timeoutId = window.setTimeout(
      () => failGooglePickerLoad(),
      GOOGLE_PICKER_LOAD_TIMEOUT_MS,
    )

    function finish(callback: () => void) {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeoutId)
      callback()
    }

    function failGooglePickerLoad() {
      finish(() => {
        googlePickerApiPromise = null
        reject(
          new GoogleDrivePickerError(
            'google-picker-load-failed',
            'Google Picker API를 불러올 수 없습니다.',
          ),
        )
      })
    }

    loader.load('picker', () => {
      finish(() => {
        if (isGoogleDrivePickerReady()) {
          resolve(undefined)
          return
        }

        reject(
          new GoogleDrivePickerError(
            'google-picker-unavailable',
            'Google Picker API를 사용할 수 없습니다.',
          ),
        )
      })
    })
  }).catch((error) => {
    googlePickerApiPromise = null
    throw error
  })

  googlePickerApiPromise = pickerPromise
  return pickerPromise
}

function bindGoogleApiScriptEvents(
  script: HTMLElement,
  resolve: () => void,
  reject: (reason: GoogleDrivePickerError) => void,
) {
  let settled = false
  const timeoutId = window.setTimeout(
    () => failGoogleApiScriptLoad(),
    GOOGLE_PICKER_LOAD_TIMEOUT_MS,
  )

  function finish(callback: () => void) {
    if (settled) {
      return
    }

    settled = true
    window.clearTimeout(timeoutId)
    callback()
  }

  function failGoogleApiScriptLoad() {
    finish(() => {
      script.dataset.eazyChorusLoadState = 'failed'
      script.remove()
      reject(
        new GoogleDrivePickerError(
          'google-api-load-failed',
          'Google API loader script를 불러올 수 없습니다.',
        ),
      )
    })
  }

  script.addEventListener(
    'load',
    () => {
      finish(() => {
        script.dataset.eazyChorusLoadState = 'loaded'
        resolve()
      })
    },
    { once: true },
  )
  script.addEventListener('error', () => failGoogleApiScriptLoad(), {
    once: true,
  })
}

function getGooglePickerApi(): GooglePickerApi | undefined {
  return (window.google as GooglePickerWindow | undefined)?.picker
}
