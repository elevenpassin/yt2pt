const dotenv = require('dotenv')
const { google } = require('googleapis')
const path = require('path')
const fs = require('fs')
const youtubeDl = require('youtube-dl')
const axios = require('axios')
const querystring = require('querystring')
const FormData = require('form-data')

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
const INSTANCE_API_URL = `${PEERTUBE_INSTANCE}/api/v1`
const APP_STATE = {
  channelInfo: {},
  videosList: {}
}

async function getChannelInformation (id) {
  try {
    const response = await youtube.channels.list({
      id,
      part: 'statistics,snippet,contentDetails'
    })

    const channelInfo = {
      id: response.data.items[0].id,
      name: response.data.items[0].snippet.title,
      uploadsPlaylist: response.data.items[0].contentDetails.relatedPlaylists.uploads,
      totalVideos: response.data.items[0].statistics.videoCount
    }
    APP_STATE.channelInfo = channelInfo
    return channelInfo
  } catch (e) {
    console.error(e)
  }
}

async function getVideosList (channelInfo, pageToken) {
  function fetchVideos (playlistId, pageToken) {
    return youtube.playlistItems.list({
      playlistId,
      part: 'id,snippet,contentDetails',
      maxResults: 50,
      pageToken: pageToken || ''
    })
  }
  try {
    let videos = []

    let response = await fetchVideos(channelInfo.uploadsPlaylist, pageToken)

    while (response.data.nextPageToken) {
      const mappedVideosList = response.data.items.map(({ contentDetails: { videoId }, snippet: {
        title,
        description
      } }) => ({
        videoId,
        title,
        description
      }))
      videos = [...videos, ...mappedVideosList]
      response = await fetchVideos(channelInfo.uploadsPlaylist, response.data.nextPageToken)
      console.log(`Collected ${videos.length} of ${channelInfo.totalVideos}`)
    }

    console.log('Collected all videos!')
    APP_STATE.videosList = videos
    return videos
  } catch (e) {
    console.error(e)
  }
}

function createDownloadFolderIfNotExists () {
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

function downloadVideo (videoId) {
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

async function downloadVideos (limit = 0) {
  let videosDownloaded = 0
  try {
    await getChannelInformation(YOUTUBE_CHANNEL_ID)
    await getVideosList(APP_STATE.channelInfo)
    await createDownloadFolderIfNotExists()

    while (videosDownloaded < limit) {
      const { videoLocation, size } = await downloadVideo(APP_STATE.videosList[videosDownloaded].videoId)
      APP_STATE.videosList[videosDownloaded].videoLocation = videoLocation
      APP_STATE.videosList[videosDownloaded].videoSize = size
      videosDownloaded += 1
      console.log(APP_STATE.videosList[videosDownloaded])
    }
  } catch (e) {
    console.error(e)
  }
}

async function yt2pt (limit) {
  try {
    await downloadVideos(limit)
    const { data: {
      client_id: clientId,
      client_secret: clientSecret
    } } = await axios.get(`${INSTANCE_API_URL}/oauth-clients/local`)
    const {
      data: {
        access_token: accessToken,
        expires_in: expiresIn
      }
    } = await axios.post(`${INSTANCE_API_URL}/users/token`, querystring.stringify({
      clientId,
      clientSecret,
      grant_type: 'password',
      response_type: 'code',
      username: PEERTUBE_USERNAME,
      password: PEERTUBE_PASSWORD
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    console.log(`Access token expires in ${expiresIn / (1000 * 60)} minutes`)

    let videosUploaded = 0
    while (videosUploaded < limit) {
      const videoToUpload = APP_STATE.videosList[videosUploaded]
      console.log(`Uploading video at ${videoToUpload.videoLocation}`)
      const formData = new FormData()
      formData.append('channelId', PEERTUBE_CHANNEL_ID)
      formData.append('name', videoToUpload.title)
      formData.append('description', videoToUpload.description)
      const videoStream = fs.createReadStream(videoToUpload.videoLocation)
      formData.append('videofile', videoStream)
      console.log('FORM DATA', formData)
      await axios.post(`${INSTANCE_API_URL}/videos/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${accessToken}`
        },
        maxContentLength: videoToUpload.videoSize * 1.5
      })
      videosUploaded += 1
      console.log(`uploaded ${videosUploaded} / ${APP_STATE.channelInfo.totalVideos}`)
    }
  } catch (e) {
    console.error(JSON.stringify(e, null, 2))
  }
}

yt2pt(1)
