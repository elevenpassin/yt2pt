const dotenv = require('dotenv')
const { google } = require('googleapis')
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
        description,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`
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

async function getAccessToken () {
  const { data: {
    client_id: clientId,
    client_secret: clientSecret
  } } = await axios.get(`${INSTANCE_API_URL}/oauth-clients/local`)
  const {
    data: {
      access_token: accessToken
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

  return accessToken
}

async function importVideo (index) {
  const accessToken = await getAccessToken()
  const videoToUpload = APP_STATE.videosList[index]
  console.log(`Triggering import for video from ${videoToUpload.videoUrl}`)
  const formData = new FormData()
  formData.append('channelId', PEERTUBE_CHANNEL_ID)
  formData.append('name', videoToUpload.title)
  formData.append('description', videoToUpload.description)
  formData.append('targetUrl', videoToUpload.videoUrl)
  return axios.post(`${INSTANCE_API_URL}/videos/imports`, formData, {
    headers: {
      ...formData.getHeaders(),
      'Authorization': `Bearer ${accessToken}`
    }
  })
}

async function yt2pt (limit) {
  try {
    await getChannelInformation(YOUTUBE_CHANNEL_ID)
    await getVideosList(APP_STATE.channelInfo)
    let videosUploaded = 0
    while (videosUploaded < limit) {
      await importVideo(videosUploaded)
      videosUploaded += 1
      console.log(`uploaded ${videosUploaded} / ${APP_STATE.channelInfo.totalVideos}`)
    }
  } catch (e) {
    console.error(JSON.stringify(e, null, 2))
  }
}

yt2pt(1)
