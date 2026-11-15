const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'

/** Only accept a Commons file explicitly linked from the actual OSM venue object. */
export function normalizeCommonsFileTitle(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1200) return null
  let raw = value.trim()
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw)
      if (url.protocol !== 'https:' || url.hostname !== 'commons.wikimedia.org') return null
      const wiki = url.pathname.match(/^\/wiki\/(?:File|Image):(.+)$/i)
      const special = url.pathname.match(/^\/wiki\/Special:FilePath\/(.+)$/i)
      const match = wiki ?? special
      if (!match) return null
      raw = decodeURIComponent(match[1])
    }
  } catch {
    return null
  }
  raw = raw.replace(/^(?:File|Image):/i, '').replaceAll('_', ' ').trim()
  if (!raw || raw.length > 255
    || [...raw].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || '[]{}<>|?#'.includes(character))
    || !/\.[a-z0-9]{2,8}$/i.test(raw)) return null
  return raw
}

export function buildCommonsPhotoLookupUrl(fileRef) {
  const title = normalizeCommonsFileTitle(fileRef)
  if (!title) return null
  return `/nx/places/image?file=${encodeURIComponent(title)}`
}

/** Prefer the explicit Commons link; accept `image` only when it is itself a Commons file URL. */
export function buildVenuePhotoLookupUrl(osmTags) {
  return buildCommonsPhotoLookupUrl(osmTags?.wikimedia_commons)
    ?? buildCommonsPhotoLookupUrl(osmTags?.image)
}

export function buildCommonsApiUrl(fileTitle, width = 800) {
  const title = normalizeCommonsFileTitle(fileTitle)
  if (!title) return null
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(Math.max(160, Math.min(1200, Math.round(width)))),
    titles: `File:${title}`,
  })
  return `${COMMONS_API}?${params.toString()}`
}

/** Normalize Commons metadata and return only a safe thumbnail with a reusable licence. */
export function normalizeCommonsImageResponse(data, fileTitle) {
  const pages = data?.query?.pages
  const page = Array.isArray(pages) ? pages[0] : null
  const info = page?.imageinfo?.[0]
  if (!info || page?.missing) return null

  let imageUrl
  try {
    imageUrl = new URL(info.thumburl ?? info.url)
  } catch {
    return null
  }
  if (imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'upload.wikimedia.org' || imageUrl.username || imageUrl.password) return null

  const ext = info.extmetadata ?? {}
  const license = cleanText(ext.LicenseShortName?.value ?? ext.UsageTerms?.value ?? '')
  const licenseUrl = approvedLicenseUrl(ext.LicenseUrl?.value ?? '')
  const publicDomain = /^public domain$/i.test(license) && String(ext.AttributionRequired?.value ?? '').toLowerCase() !== 'true'
  if (!licenseUrl && !publicDomain) return null

  const artist = cleanText(ext.Artist?.value ?? '')
  const credit = cleanText(ext.Credit?.value ?? '')
  const attributionRequired = String(ext.AttributionRequired?.value ?? '').toLowerCase() === 'true'
  const attribution = artist || credit || 'Wikimedia Commons'
  if (attributionRequired && attribution === 'Wikimedia Commons') return null

  const title = normalizeCommonsFileTitle(fileTitle)
  if (!title) return null
  const sourceUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title).replaceAll('%20', '_')}`
  return {
    url: imageUrl.toString(),
    attribution,
    license: license || 'Public domain',
    licenseUrl: licenseUrl ?? sourceUrl,
    sourceUrl,
  }
}

function approvedLicenseUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const url = new URL(raw.replace(/^http:/i, 'https:'))
    if (url.protocol !== 'https:' || url.username || url.password) return null
    if (url.hostname === 'creativecommons.org'
      && (/^\/licenses\/(?:by|by-sa)\/\d+(?:\.\d+)?(?:\/|$)/i.test(url.pathname)
        || /^\/publicdomain\/(?:zero|mark)\/\d+(?:\.\d+)?(?:\/|$)/i.test(url.pathname))) return url.toString()
    if (url.hostname === 'gnu.org' && /^\/licenses\/fdl(?:\.html)?$/i.test(url.pathname)) return url.toString()
  } catch {
    return null
  }
  return null
}

function cleanText(value) {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&(?:amp|#38);/gi, '&')
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}
