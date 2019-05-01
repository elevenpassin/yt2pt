const app = require('../app')
const server = app.listen()
const request = require('supertest').agent(server)

describe('routes: auth', () => {
  afterAll(() => {
    server.close()
  })

  it('should return a signed jwt token when a POST request with username & email is sent to /auth', async () => {
    const response = await request.post('/auth')
      .send({
        username: 'admin',
        password: 'password'
      })
      .set('Accept', 'application/json')

    expect(response.status).toBe(200)
    expect(response.type).toEqual('application/json')
    expect(response.body.token).toBeDefined()
    expect(typeof response.body.token).toEqual('string')
  })

  it('should return throw an error when username is not set', async () => {
    const response = await request.post('/auth')
      .send({
        password: 'password'
      })
      .set('Accept', 'text/plain')

    expect(response.status).toBe(400)
    expect(response.type).toEqual('text/plain')
    expect(response.text).toEqual('username is required')
  })

  it('should return throw an error when password is not set', async () => {
    const response = await request.post('/auth')
      .send({
        username: 'admin',
      })
      .set('Accept', 'text/plain')

    expect(response.status).toBe(400)
    expect(response.type).toEqual('text/plain')
    expect(response.text).toEqual('password is required')
  })
})