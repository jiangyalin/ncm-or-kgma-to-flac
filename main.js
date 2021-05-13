const fs = require('fs')
const metaFlac = require('metaflac-js')
const ID3Writer = require('browser-id3-writer')
const ncm = require('./decrypt/ncm')
const CryptoJS = require('crypto-js')
const CORE_KEY = CryptoJS.enc.Hex.parse('687a4852416d736f356b496e62617857')
const META_KEY = CryptoJS.enc.Hex.parse('2331346C6A6B5F215C5D2630553C2728')
const AudioMimeType = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wma: 'audio/x-ms-wma',
  wav: 'audio/x-wav'
}

const main = async () => {
  // const raw = fs.readFileSync('./file/test.ncm')
  const raw = fs.readFileSync('./file/test.ncm')
  console.log('raw', raw)
  // console.log('raw', raw)
  // const raw_filename = 'test-a'
  // const raw_ext = 'flac'
  // const rt_data = await ncm.Decrypt(raw, raw_filename, raw_ext)
  // console.log('rt_data', rt_data)
  // fs.writeFileSync('./test-a.flac', rt_data.audioData)

  // const flac = new metaFlac('./test-flac2.flac')
  // flac.setTag('TITLE=My Music')
  // flac.save()

  // const writer = new ID3Writer(raw)
  // console.log('writer', writer)

  const fileBuffer = toArrayBuffer(raw)
  // console.log('fileBuffer', fileBuffer)
  const dataView = new DataView(fileBuffer)
  // console.log('dataView', dataView)

  const keyDataObj = getKeyData(dataView, toArrayBuffer(raw), 10)
  const keyBox = getKeyBox(keyDataObj.data)

  const musicMetaObj = getMetaData(dataView, fileBuffer, keyDataObj.offset)
  const musicMeta = musicMetaObj.data

  console.log('musicMetaObj', musicMetaObj)

  let audioOffset = musicMetaObj.offset + dataView.getUint32(musicMetaObj.offset + 5, true) + 13
  let audioData = new Uint8Array(fileBuffer, audioOffset)
  const mime = AudioMimeType[musicMeta.format]
  // const musicData = new Blob([audioData], { type: mime })
  console.log('audioData', toBuffer(audioData))
  // console.log('mime', mime)
  // console.log('musicData', musicData)
  const data = new Buffer(toBuffer(audioData))
  console.log('data', data)
  fs.writeFileSync('./test-a.flac', data)

  // const flac = new metaFlac(writer.arrayBuffer)
  // flac.save()
  // console.log('flac', flac)
}

const toArrayBuffer = buf => {
  var ab = new ArrayBuffer(buf.length)
  var view = new Uint8Array(ab)
  for (let i = 0; i < buf.length; ++i) {
    view[i] = buf[i]
  }
  return ab
}

const toBuffer = ab => {
  let buf = new Buffer(ab.byteLength)
  let view = new Uint8Array(ab)
  for (let i = 0; i < buf.length; ++i) {
    buf[i] = view[i]
  }
  return buf
}

const getKeyData = (dataView, fileBuffer, offset) => {
  const keyLen = dataView.getUint32(offset, true)
  offset += 4
  const cipherText = new Uint8Array(fileBuffer, offset, keyLen).map(
    uint8 => uint8 ^ 0x64
  )
  offset += keyLen

  const plainText = CryptoJS.AES.decrypt(
    {
      ciphertext: CryptoJS.lib.WordArray.create(cipherText)
    },
    CORE_KEY,
    {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    }
  )
  const result = new Uint8Array(plainText.sigBytes)
  const words = plainText.words
  const sigBytes = plainText.sigBytes
  for (let i = 0; i < sigBytes; i++) {
    result[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
  }

  return {offset: offset, data: result.slice(17)}
}

const getKeyBox = keyData => {
  const box = new Uint8Array(Array(256).keys())
  const keyDataLen = keyData.length
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (box[i] + j + keyData[i % keyDataLen]) & 0xff;
    [box[i], box[j]] = [box[j], box[i]]
  }

  return box.map((_, i, arr) => {
    i = (i + 1) & 0xff
    const si = arr[i]
    const sj = arr[(i + si) & 0xff]
    return arr[(si + sj) & 0xff]
  })
}

const getMetaData = (dataView, fileBuffer, offset) => {
  const metaDataLen = dataView.getUint32(offset, true)
  offset += 4
  if (metaDataLen === 0) return {data: {}, offset: offset}

  const cipherText = new Uint8Array(fileBuffer, offset, metaDataLen).map(
    data => data ^ 0x63
  )
  offset += metaDataLen

  const plainText = CryptoJS.AES.decrypt({
      ciphertext: CryptoJS.enc.Base64.parse(
        CryptoJS.lib.WordArray.create(cipherText.slice(22)).toString(CryptoJS.enc.Utf8)
      )
    },
    META_KEY,
    {mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7}
  ).toString(CryptoJS.enc.Utf8)
  const labelIndex = plainText.indexOf(":")
  let result = JSON.parse(plainText.slice(labelIndex + 1))
  if (plainText.slice(0, labelIndex) === "dj") {
    result = result.mainMusic
  }
  if (!!result.albumPic) result.albumPic = result.albumPic.replace("http://", "https://")
  return {data: result, offset: offset}
}

main()
