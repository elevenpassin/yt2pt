const app = require('../app')
const supertest = require('supertest')

describe('route: auth', () => {
  const server = app.listen()
  const request = supertest.agent(server)

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


describe('auth: protected routes', () => {
  const server = app.listen()
  const request = supertest.agent(server)
  const patchReq = {
    object: {
      people: [{
        name: 'Robin',
        age: 16
      }]
    },
    patch: [
      {
        op: "add",
        path: "/people/1",
        value: {
          name: 'Ginger',
          age: 17
        }
      }
    ]
  }
  const invalidAuthToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
  afterAll(() => {
    server.close()
  })

  it('should return 400 when a protected route is accessed without sending a token', async () => {
    const response = await request.post('/patch')
      .send(patchReq)
      .set('Accept', 'application/json')

    expect(response.status).toBe(400)
    expect(response.type).toEqual('application/json')
    expect(response.body).toEqual({
      message: 'Please send your authorization token in order to authorize yourself'
    })
  })

  it('should return 401 for unauthorized access to protected route /patch', async () => {
    const response = await request.post('/patch')
      .send(patchReq)
      .set('Authorization', invalidAuthToken)
      .set('Accept', 'application/json')

    expect(response.status).toBe(401)
    expect(response.type).toEqual('application/json')
    expect(response.body).toEqual({
      message: 'Please authorize yourself to gain access to this resource'
    })
  })

  it('should return 401 for unauthorized access to protected route /thumbnail', async () => {
    const response = await request.post('/thumbnail')
      .send(patchReq)
      .set('Authorization', invalidAuthToken)
      .set('Accept', 'application/json')

    expect(response.status).toBe(401)
    expect(response.type).toEqual('application/json')
    expect(response.body).toEqual({
      message: 'Please authorize yourself to gain access to this resource'
    })
  })
})