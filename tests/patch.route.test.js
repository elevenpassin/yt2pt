const app = require('../app')
const supertest = require('supertest')

describe('route: patch', () => {
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
  let authToken
  beforeAll(async () => {
    const { body: {
      token
    } } = await request.post('/auth')
      .send({
        username: 'admin',
        password: 'password'
      })
      .set('Accept', 'application/json')

    authToken = token
  })

  afterAll(() => {
    server.close()
  })

  it('should return 400 when a POST request is made without the "object" and "patch" properties', async () => {
    const response = await request.post('/patch')
      .send({
      })
      .set('Authorization', authToken)
      .set('Accept', 'application/json')

    expect(response.status).toBe(400)
    expect(response.type).toEqual('application/json')
    expect(response.body).toEqual({
      message: 'Please send a body with a "patch" property along with the "body" property to which the patch should be applied.'
    })
  })

  it('should return 400 when a POST request is made without any property named "object" in the body', async () => {
    const response = await request.post('/patch')
      .send({
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
      })
      .set('Authorization', authToken)
      .set('Accept', 'application/json')

    expect(response.status).toBe(400)
    expect(response.type).toEqual('application/json')
    expect(response.body).toEqual({
      message: 'Please send a body with an "object" property along with the "patch" to be applied to the "body" property.'
    })
  })

  it('should return 400 when a POST request is made without any property named "patch" in the body', async () => {
    const response = await request.post('/patch')
      .send({
        object: {
          name: 'Alice'
        }
      })
      .set('Authorization', authToken)
      .set('Accept', 'application/json')

    expect(response.status).toBe(400)
    expect(response.type).toEqual('application/json')
    expect(response.body).toEqual({
      message: 'Please send a body with a "patch" property along with the "body" property to which the patch should be applied.'
    })
  })

  it('should return a patched object with status 200 when a POST request with object and patch is sent', async () => {
    const response = await request.post('/patch')
      .send(patchReq)
      .set('Authorization', authToken)
      .set('Accept', 'application/json')

    expect(response.status).toBe(200)
    expect(response.type).toEqual('application/json')
    expect(response.body).toEqual({
      people: [{
        name: 'Robin',
        age: 16
      },
      {
        name: 'Ginger',
        age: 17
      }]
    })
  })
})