const Koa = require('koa')
const Router = require('koa-router')

const app = new Koa()
const router = new Router()

router.get('/', async ctx => {
  ctx.body = 'Hello world'
})


app.use(logger)
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

module.exports = app