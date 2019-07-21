const { google } = require('googleapis')
const path = require('path')
const fs = require('fs')
const youtubeDl = require('youtube-dl')
const axios = require('axios')
const querystring = require('querystring')
const FormData = require('form-data')

const youtube = google.youtube({
  version: 'v3',
  auth: 'AIzaSyBTe2_RTdZ6nyqQGyZ9PWc0yHP_FmzBirM'
})
const USERNAME = 'anarchist'
const PASSWORD = 'D#*%J^K^rwtvp3YRk6$Lehg$mH@$K9'
const CHANNEL_ID = 'UCdoRUr0SUpfGQC4vsXZeovg'
const PEERTUBE_CHANNEL_ID = 10674
const DOWNLOAD_LOCATION = path.resolve(__dirname, 'yt2pt_downloads')
const INSTANCE_URL = 'https://peertube.video'
const INSTANCE_API_URL = `${INSTANCE_URL}/api/v1`
const APP_STATE = {
  channelInfo: {},
  videosList: {}
}

async function getChannelInformation(id) {
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


async function getVideosList(channelInfo, pageToken) {
  try {
    let videos = [];

    function fetchVideos(playlistId, pageToken) {
      return youtube.playlistItems.list({
        playlistId,
        part: 'id,snippet,contentDetails',
        maxResults: 50,
        pageToken: pageToken || ''
      })
    }
    let response = await fetchVideos(channelInfo.uploadsPlaylist, pageToken);

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
      console.log(`Collected ${videos.length} of ${channelInfo.totalVideos}`);
    }

    console.log('Collected all videos!')
    APP_STATE.videosList = videos
    return videos
  } catch (e) {
    console.error(e)
  }
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

// function downloadVideo(videoId) {
//   const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
//   const video = youtubeDl(videoUrl)
//   const videoLocation = `${DOWNLOAD_LOCATION}/${videoId}.mp4`

//   return new Promise((resolve, reject) => {
//     let size = 0;
//     video.on('info', info => {
//       console.log('Download started');
//       console.log('filename: ' + info._filename);
//       console.log('size: ' + info.size);
//       size = info.size
//     })
//     video.on('error', reject)
//     const stream = fs.createWriteStream(videoLocation)
//     stream.on('close', () => {
//       console.log('Finished downloading')
//       resolve({
//         videoLocation,
//         size
//       })
//     })
//     video.pipe(stream)
//   })
// }

// async function downloadVideos(limit = 0) {
//   let videosDownloaded = 0;
//   try {
//     await getChannelInformation(CHANNEL_ID)
//     await getVideosList(APP_STATE.channelInfo)
//     await createDownloadFolderIfNotExists()

//     while (videosDownloaded < limit) {
//       const { videoLocation, size } = await downloadVideo(APP_STATE.videosList[videosDownloaded].videoId)
//       APP_STATE.videosList[videosDownloaded].videoLocation = videoLocation
//       APP_STATE.videosList[videosDownloaded].videoSize = size
//       videosDownloaded += 1;
//       console.log(APP_STATE.videosList[videosDownloaded])
//     }
//   } catch (e) {
//     console.error(e)
//   }
// }

async function getAccessToken() {
  const { data: {
    client_id,
    client_secret
  } } = await axios.get(`${INSTANCE_API_URL}/oauth-clients/local`)
  const {
    data: {
      access_token,
      expires_in,
      refresh_token
    }
  } = await axios.post(`${INSTANCE_API_URL}/users/token`, querystring.stringify({
    client_id,
    client_secret,
    grant_type: 'password',
    response_type: 'code',
    username: USERNAME,
    password: PASSWORD
  }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

  return access_token
}

async function importVideo(index) {
  const accessToken = await getAccessToken()
  const videoToUpload = APP_STATE.videosList[index];
  console.log(`Triggering import for video from ${videoToUpload.videoUrl}`)
  const formData = new FormData();
  formData.append('channelId', PEERTUBE_CHANNEL_ID)
  formData.append('name', videoToUpload.title)
  formData.append('description', videoToUpload.description)
  formData.append('targetUrl', videoToUpload.videoUrl)
  return axios.post(`${INSTANCE_API_URL}/videos/imports`, formData, {
    headers: {
      ...formData.getHeaders(),
      'Authorization': `Bearer ${accessToken}`
    },
  })
}

async function yt2pt(limit) {
  try {
    await getChannelInformation(CHANNEL_ID)
    await getVideosList(APP_STATE.channelInfo)
    let retries = 0;
    let videosUploaded = 0;
    while (videosUploaded < limit) {
      await importVideo(videosUploaded)
      videosUploaded += 1;
      console.log(`uploaded ${videosUploaded} / ${APP_STATE.channelInfo.totalVideos}`)
    }
  } catch (e) {
    console.error(JSON.stringify(e, null, 2))
  }
}

yt2pt(180)