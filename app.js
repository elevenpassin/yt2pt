require('dotenv').config()
const Koa = require('koa')
const Router = require('koa-router')
const koaBody = require('koa-body')
const jwt = require('jsonwebtoken')
const jsonpatch = require('jsonpatch')

const { TOKEN_SECRET } = process.env

const app = new Koa()
const router = new Router()

router.get('/', async ctx => {
  ctx.body = 'Hello world'
})

router.post('/auth', async ctx => {
  const { username, password } = ctx.request.body

  if (!username)
    ctx.throw(400, 'username is required')
  if (!password)
    ctx.throw(400, 'password is required')

  ctx.body = {
    token: await createToken(username, password, TOKEN_SECRET, '30m')
  }
})

router.post('/patch', authMiddleware, async ctx => {
  const { object, patch } = ctx.request.body
  if (!object && !patch) {
    ctx.status = 400
    ctx.type = 'application/json'
    ctx.body = {
      message: 'Please send a body with a "patch" property along with the "body" property to which the patch should be applied.'
    }
  } else if (!object) {
    ctx.status = 400
    ctx.type = 'application/json'
    ctx.body = {
      message: 'Please send a body with an "object" property along with the "patch" to be applied to the "body" property.'
    }
  } else if (!patch) {
    ctx.status = 400
    ctx.type = 'application/json'
    ctx.body = {
      message: 'Please send a body with a "patch" property along with the "body" property to which the patch should be applied.'
    }
  }

  if (object && patch) {
    const patchedObject = jsonpatch.apply_patch(object, patch)

    ctx.status = 200
    ctx.type = 'application/json'
    ctx.body = patchedObject
  }
})

router.post('/thumbnail', authMiddleware, async ctx => {
  ctx.body = 'To be implemented'
})

app.use(logger)
app.use(koaBody({
  jsonLimit: '1kb'
}))
app.use(router.routes())
app.use(router.allowedMethods())
app.use(pageNotFound)

async function logger(ctx, next) {
  const format = ':method :url'
  const str = format
    .replace(':method', ctx.method)
    .replace(':url', ctx.url)

  console.log(str)

  await next()
}

async function pageNotFound(ctx) {
  ctx.status = 404

  switch (ctx.accepts('html', 'json')) {
    case 'html':
      ctx.type = 'html'
      ctx.body = '<p>Page Not Found</p>'
      break;
    case 'json':
      ctx.body = {
        message: 'Page Not Found'
      }
      break
    default:
      ctx.type = 'text'
      ctx.body = 'Page Not Found'
  }
}

async function authMiddleware(ctx, next) {
  const token = ctx.headers.authorization
  if (token) {
    let isValid = false
    try {
      jwt.verify(token, TOKEN_SECRET)
      isValid = true
    } catch (e) {
      isValid = false
    }

    if (isValid) {
      await next()
    } else {
      ctx.status = 401
      ctx.type = 'application/json'
      ctx.body = {
        message: 'Please authorize yourself to gain access to this resource'
      }
    }
  } else {
    ctx.status = 400
    ctx.type = 'application/json'
    ctx.body = {
      message: 'Please send your authorization token in order to authorize yourself'
    }
  }
}

async function createToken(username, password, secret, expiresIn) {
  return jwt.sign({
    username,
    password
  }, secret, { expiresIn })
}

module.exports = app