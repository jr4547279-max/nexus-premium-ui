import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCommonsApiUrl,
  buildCommonsPhotoLookupUrl,
  buildVenuePhotoLookupUrl,
  normalizeCommonsFileTitle,
  normalizeCommonsImageResponse,
} from './commons-photo.mjs'

test('only accepts an explicit Wikimedia Commons file identity from a venue tag', () => {
  assert.equal(normalizeCommonsFileTitle('File:Anchor Inn.jpg'), 'Anchor Inn.jpg')
  assert.equal(normalizeCommonsFileTitle('https://commons.wikimedia.org/wiki/File:Anchor_Inn.jpg'), 'Anchor Inn.jpg')
  assert.equal(normalizeCommonsFileTitle('Category:Public houses in Eastbourne'), null)
  assert.equal(normalizeCommonsFileTitle('https://images.example/anchor.jpg'), null)
  assert.equal(normalizeCommonsFileTitle('https://commons.wikimedia.org/wiki/Category:pubs'), null)
  assert.equal(buildCommonsPhotoLookupUrl('File:Anchor Inn.jpg'), '/nx/places/image?file=Anchor%20Inn.jpg')
  assert.equal(buildVenuePhotoLookupUrl({ wikimedia_commons: 'File:Anchor Inn.jpg' }), '/nx/places/image?file=Anchor%20Inn.jpg')
  assert.equal(buildVenuePhotoLookupUrl({ image: 'https://commons.wikimedia.org/wiki/File:Anchor_Inn.jpg' }), '/nx/places/image?file=Anchor%20Inn.jpg')
  assert.equal(buildVenuePhotoLookupUrl({ image: 'https://images.example/anchor.jpg' }), null)
  assert.match(buildCommonsApiUrl('Anchor Inn.jpg'), /^https:\/\/commons\.wikimedia\.org\/w\/api\.php\?/)
})

test('normalizes an attributed CC-BY-SA photo and removes metadata HTML', () => {
  const photo = normalizeCommonsImageResponse({
    query: { pages: [{ imageinfo: [{
      thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Anchor.jpg/800px-Anchor.jpg',
      extmetadata: {
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
        AttributionRequired: { value: 'true' },
        Artist: { value: '<a href="https://commons.wikimedia.org">Local Photographer</a> &amp; Co' },
      },
    }] }] },
  }, 'Anchor Inn.jpg')
  assert.equal(photo.url, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Anchor.jpg/800px-Anchor.jpg')
  assert.equal(photo.attribution, 'Local Photographer & Co')
  assert.equal(photo.license, 'CC BY-SA 4.0')
  assert.equal(photo.licenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/')
  assert.equal(photo.sourceUrl, 'https://commons.wikimedia.org/wiki/File:Anchor_Inn.jpg')
})

test('does not expose missing, unsafe, non-commercial, no-derivatives or unattributed images', () => {
  assert.equal(normalizeCommonsImageResponse({ query: { pages: [{ missing: true }] } }, 'Missing.jpg'), null)
  const base = {
    url: 'https://upload.wikimedia.org/a.jpg',
    extmetadata: {
      LicenseShortName: { value: 'CC BY-NC-ND 4.0' },
      LicenseUrl: { value: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
      AttributionRequired: { value: 'true' },
      Artist: { value: 'Photographer' },
    },
  }
  assert.equal(normalizeCommonsImageResponse({ query: { pages: [{ imageinfo: [base] }] } }, 'Venue.jpg'), null)
  const unsafeUrl = { ...base, url: 'https://evil.example/tracker.jpg', thumburl: undefined, extmetadata: { ...base.extmetadata, LicenseShortName: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' } } }
  assert.equal(normalizeCommonsImageResponse({ query: { pages: [{ imageinfo: [unsafeUrl] }] } }, 'Venue.jpg'), null)
  const noAttribution = { ...base, extmetadata: { ...base.extmetadata, LicenseShortName: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' }, Artist: { value: '' }, Credit: { value: '' } } }
  assert.equal(normalizeCommonsImageResponse({ query: { pages: [{ imageinfo: [noAttribution] }] } }, 'Venue.jpg'), null)
})

test('allows verified public-domain imagery and supplies a Commons source link', () => {
  const photo = normalizeCommonsImageResponse({
    query: { pages: [{ imageinfo: [{
      url: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Old_Pub.jpg',
      extmetadata: {
        LicenseShortName: { value: 'Public domain' },
        AttributionRequired: { value: 'false' },
      },
    }] }] },
  }, 'Old Pub.jpg')
  assert.equal(photo.license, 'Public domain')
  assert.equal(photo.attribution, 'Wikimedia Commons')
  assert.match(photo.sourceUrl, /commons\.wikimedia\.org\/wiki\/File:/)
})
