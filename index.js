const dotenv = require('dotenv')
const { google } = require('googleapis')
const path = require('path')
const fs = require('fs')
const youtubeDl = require('youtube-dl')
const axios = require('axios')
const querystring = require('querystring')
const FormData = require('form-data')
const sqlite3 = require('sqlite3').verbose()

// Configure environment variables
dotenv.config()

const {
  YOUTUBE_API_KEY,
  PEERTUBE_INSTANCE,
  PEERTUBE_USERNAME,
  PEERTUBE_PASSWORD,
  PEERTUBE_CHANNEL_ID,
  YOUTUBE_CHANNEL_ID
} = process.env

const youtube = google.youtube({
  version: 'v3',
  auth: YOUTUBE_API_KEY
})
const DOWNLOAD_LOCATION = path.resolve(__dirname, 'yt2pt_downloads')
const DATABASE_LOCATION = path.resolve(__dirname, 'journal.sqlite')
const INSTANCE_API_URL = `${PEERTUBE_INSTANCE}/api/v1`
const APP_STATE = {
  channelInfo: {},
  videosList: {}
}
const db = new sqlite3.Database(DATABASE_LOCATION)

/**
 * Creates `videos` and `channels` tables if they do not exist.
 *
 * @returns {Promise<undefined>}
 */
function prepareDatabase() {
  return new Promise((resolve, reject) => {
    try {
      db.serialize(() => {
        db.run(
          'CREATE TABLE IF NOT EXISTS videos (videoId TEXT PRIMARY KEY, youtubeUrl TEXT, localUrl TEXT, peertubeUrl TEXT, uploaded INTEGER, downloaded INTEGER, title TEXT, description TEXT)'
        )
        db.run(
          'CREATE TABLE IF NOT EXISTS channels (channelId TEXT PRIMARY KEY, channelName TEXT, uploadsPlaylistId TEXT, totalVideos INTEGER)'
        )
        resolve()
      })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Fetch and update channel information in the channel's entry in channels table.
 *
 * @param {*} id
 * @returns
 */
function getChannelInformation(id) {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await youtube.channels.list({
        id,
        part: 'statistics,snippet,contentDetails'
      })

      const channelInfo = {
        id: response.data.items[0].id,
        name: response.data.items[0].snippet.title,
        uploadsPlaylist:
          response.data.items[0].contentDetails.relatedPlaylists.uploads,
        totalVideos: response.data.items[0].statistics.videoCount
      }

      db.get('SELECT * from channels WHERE channelId = ?', channelInfo.id, (err, channel) => {
        if (err) {
          reject(err)
        }

        if (channel) {
          db.run(
            'UPDATE channels SET totalVideos = ? WHERE channelId = ?',
            channelInfo.totalVideos,
            channelInfo.id,
            err => {
              if (err) reject(err)

              console.log('Updated channel information')
              APP_STATE.channelInfo = channelInfo
              resolve(channelInfo)
            }
          )
        } else {
          db.run(
            'INSERT INTO channels VALUES (?, ?, ?, ?, ?)',
            channelInfo.id,
            channelInfo.name,
            channelInfo.uploadsPlaylist,
            channelInfo.totalVideos,
            0,
            (row, err) => {
              if (err) reject(err)

              console.log('Inserted channel information: ', row)
              APP_STATE.channelInfo = channelInfo
              resolve(channelInfo)
            }
          )
        }
      })
    } catch (e) {
      console.error(e)
    }
  })
}

function getAllVideosList(channelInfo, pageToken) {
  function fetchVideos(playlistId, pageToken) {
    return youtube.playlistItems.list({
      playlistId,
      part: 'id,snippet,contentDetails',
      maxResults: 50,
      pageToken: pageToken || ''
    })
  }

  function recordVideo({ videoId, title, description }) {
    return new Promise((resolve, reject) => {
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
      db.run(
        `INSERT INTO videos VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [videoId, youtubeUrl, '', 0, 0, title, description],
        (_, err) => {
          if (err) reject(err)
          resolve()
        }
      )
    })
  }

  return new Promise(async (resolve, reject) => {
    try {
      let videos = []

      let response = await fetchVideos(channelInfo.uploadsPlaylist, pageToken)

      while (response.data.nextPageToken) {
        const mappedVideosList = response.data.items.map(
          ({
            contentDetails: { videoId },
            snippet: { title, description }
          }) => ({
            videoId,
            title,
            description
          })
        )
        videos = [...videos, ...mappedVideosList]
        response = await fetchVideos(
          channelInfo.uploadsPlaylist,
          response.data.nextPageToken
        )
        console.log(`Received ${videos.length} of ${channelInfo.totalVideos}`)
      }

      console.log('Received all videos list!')

      const recordedVideos = [...videos].map(video => recordVideo(video))

      await Promise.all(recordedVideos)
      console.log('Recorded all videos to database!')
      APP_STATE.videosList = videos
      resolve(videos)
      return videos
    } catch (e) {
      reject(e)
    }
  })
}

function createDownloadFolderIfNotExists() {
  return new Promise(async (resolve, reject) => {
    try {
      await fs.promises.access(DOWNLOAD_LOCATION)
      resolve()
    } catch (e) {
      if (e.code === 'ENOENT') {
        // Create folder if doesnt exist
        await fs.promises.mkdir(DOWNLOAD_LOCATION)
        resolve()
      } else {
        reject(e)
      }
    }
  })
}

function downloadVideo(videoId) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
  const video = youtubeDl(videoUrl)
  const videoLocation = `${DOWNLOAD_LOCATION}/${videoId}.mp4`

  return new Promise((resolve, reject) => {
    let size = 0
    video.on('info', info => {
      console.log('Download started')
      console.log('filename: ' + info._filename)
      console.log('size: ' + info.size)
      size = info.size
    })
    video.on('error', reject)
    const stream = fs.createWriteStream(videoLocation)
    stream.on('close', () => {
      console.log('Finished downloading')
      resolve({
        videoLocation,
        size
      })
    })
    video.pipe(stream)
  })
}

async function downloadVideos(limit = 0) {
  let videosDownloaded = 0
  try {
    await getChannelInformation(YOUTUBE_CHANNEL_ID)
    await getAllVideosList(APP_STATE.channelInfo)
    await createDownloadFolderIfNotExists()

    while (videosDownloaded < limit) {
      const { videoLocation, size } = await downloadVideo(
        APP_STATE.videosList[videosDownloaded].videoId
      )
      APP_STATE.videosList[videosDownloaded].videoLocation = videoLocation
      APP_STATE.videosList[videosDownloaded].videoSize = size
      videosDownloaded += 1
      console.log(APP_STATE.videosList[videosDownloaded])
    }
  } catch (e) {
    console.error(e)
  }
}

async function getVideosToDownload() {
  return new Promise((resolve, reject) => {
    try {
      db.serialize(() => {
        db.all('SELECT * FROM videos WHERE downloaded = 0', (err, rows) => {
          if (err) reject(err)
          resolve(rows)
        })
      })
    } catch (e) {
      reject(e)
    }
  })
}

async function yt2pt(limit) {
  try {
    await prepareDatabase()
    const channelInfo = await getChannelInformation(YOUTUBE_CHANNEL_ID)
    const channelVideos = await getAllVideosList(channelInfo)
    const videosToDownload = await getVideosToDownload()
    // await downloadVideos(limit)
    // const { data: {
    //   client_id: clientId,
    //   client_secret: clientSecret
    // } } = await axios.get(`${INSTANCE_API_URL}/oauth-clients/local`)
    // const {
    //   data: {
    //     access_token: accessToken,
    //     expires_in: expiresIn
    //   }
    // } = await axios.post(`${INSTANCE_API_URL}/users/token`, querystring.stringify({
    //   clientId,
    //   clientSecret,
    //   grant_type: 'password',
    //   response_type: 'code',
    //   username: PEERTUBE_USERNAME,
    //   password: PEERTUBE_PASSWORD
    // }), {
    //   headers: {
    //     'Content-Type': 'application/x-www-form-urlencoded'
    //   }
    // })

    // console.log(`Access token expires in ${expiresIn / (1000 * 60)} minutes`)

    // let videosUploaded = 0
    // while (videosUploaded < limit) {
    //   const videoToUpload = APP_STATE.videosList[videosUploaded]
    //   console.log(`Uploading video at ${videoToUpload.videoLocation}`)
    //   const formData = new FormData()
    //   formData.append('channelId', PEERTUBE_CHANNEL_ID)
    //   formData.append('name', videoToUpload.title)
    //   formData.append('description', videoToUpload.description)
    //   const videoStream = fs.createReadStream(videoToUpload.videoLocation)
    //   formData.append('videofile', videoStream)
    //   console.log('FORM DATA', formData)
    //   await axios.post(`${INSTANCE_API_URL}/videos/upload`, formData, {
    //     headers: {
    //       ...formData.getHeaders(),
    //       'Authorization': `Bearer ${accessToken}`
    //     },
    //     maxContentLength: videoToUpload.videoSize * 1.5
    //   })
    //   videosUploaded += 1
    //   console.log(`uploaded ${videosUploaded} / ${APP_STATE.channelInfo.totalVideos}`)
    // }
  } catch (e) {
    console.error(JSON.stringify(e, null, 2))
  }
}

yt2pt(1)
